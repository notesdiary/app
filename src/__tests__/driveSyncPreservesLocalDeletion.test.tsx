import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB, setActiveProjectDb } from '../lib/db';
import { listAllEntries, putEntries } from '../lib/entriesRepo';
import { setDriveMeta } from '../lib/metaRepo';

// Regression test: sync -> remove-from-local -> re-sync must not resurrect
// the removed entry. A blind union-merge of local+remote on every sync
// undoes local deletions whenever the remote file itself hasn't changed
// since the last sync, because the remote copy still has the old entry and
// gets treated as "remote-only".
const TEST_PROJECT = vi.hoisted(() => ({
  id: 'proj-del-test',
  name: 'Deletion Test Project',
  dbName: 'test-driveSyncPreservesLocalDeletion-db',
  createdAt: 0,
}));

vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [TEST_PROJECT]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async () => TEST_PROJECT),
}));

const ensureProjectFolderId = vi.hoisted(() => vi.fn(async () => 'folder-id'));

// In-memory "Drive" for the single remainder-rule backup file, seeded lazily
// by the first write() call — nothing else ever touches it in this test, so
// files.status() always reports it as unchanged since our own last write.
let remoteFileId: string | undefined;
let remoteContent = '';

const filesList = vi.fn(async () => (remoteFileId ? [{ id: remoteFileId, name: 'notesdiary-backup.json' }] : []));
const filesRead = vi.fn(async () => remoteContent);
const filesWrite = vi.fn(async (opts: { fileId?: string; content: string }) => {
  remoteContent = opts.content;
  remoteFileId = opts.fileId ?? remoteFileId ?? 'remote-file-1';
  return { id: remoteFileId };
});
const filesStatus = vi.fn(async () => ({
  fileId: remoteFileId ?? 'unused',
  exists: true,
  baseVersion: '1',
  remoteVersion: '1',
  changedSinceRestore: false,
  lastRestoredAt: Date.now(),
}));
const getConnection = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));
const connect = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));

const fakeProjectHandle = {
  connect,
  getConnection,
  disconnect: vi.fn(async () => {}),
  ensureFolderPath: vi.fn(async () => 'folder-id'),
  files: { list: filesList, read: filesRead, write: filesWrite, remove: vi.fn(async () => {}), status: filesStatus },
  permissions: { list: vi.fn(async () => []), grant: vi.fn(), update: vi.fn(), revoke: vi.fn() },
};

vi.mock('../lib/drive', () => ({
  drive: {
    activate: vi.fn(() => () => {}),
    reconcile: vi.fn(async () => {}),
    dropProject: vi.fn(async () => {}),
    project: vi.fn(() => fakeProjectHandle),
  },
  ensureJsonExtension: (fileName: string) => {
    const trimmed = fileName.trim();
    return trimmed.endsWith('.json') ? trimmed : trimmed + '.json';
  },
  ensureProjectFolderId,
}));

describe('Drive sync preserves a local deletion across re-sync', () => {
  it('does not resurrect an entry that was removed locally after an earlier sync', async () => {
    window.location.hash = `#/project/${TEST_PROJECT.id}`;
    setActiveProjectDb(TEST_PROJECT.dbName);
    const db = await getDB();
    for (const store of ['entries', 'meta'] as const) {
      const tx = db.transaction(store, 'readwrite');
      for (const key of await tx.store.getAllKeys()) {
        await tx.store.delete(key);
      }
      await tx.done;
    }
    remoteFileId = undefined;
    remoteContent = '';
    vi.clearAllMocks();

    await putEntries([
      { id: 'e-keep', date: '2026-01-01', time: '09:00', text: 'keep this one', createdAt: 1 },
      { id: 'e-remove', date: '2026-01-02', time: '10:00', text: 'remove this one', createdAt: 2 },
    ]);
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });

    render(<App />);

    // First sync: both entries go up to Drive.
    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);
    const syncButton = await screen.findByRole('button', { name: 'Sync now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(filesWrite).toHaveBeenCalled();
      expect(remoteContent).toContain('e-keep');
      expect(remoteContent).toContain('e-remove');
    });

    // Back to the diary and remove one entry locally.
    const backButton = await screen.findByRole('button', { name: '← Back to diary' });
    await userEvent.click(backButton);

    const removedRow = (await screen.findByText('remove this one')).closest('.entry-row') as HTMLElement;
    const removeButton = within(removedRow).getByTitle('Archive entry');
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText('remove this one')).not.toBeInTheDocument();
    });

    // Re-sync: the deletion must stick, both locally and on Drive.
    await userEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sync now' }));

    await waitFor(() => {
      expect(filesWrite).toHaveBeenCalledTimes(2);
    });

    expect(remoteContent).toContain('e-keep');
    expect(remoteContent).not.toContain('e-remove');

    setActiveProjectDb(TEST_PROJECT.dbName);
    const local = await listAllEntries();
    expect(local.map(e => e.id)).not.toContain('e-remove');
  });
});
