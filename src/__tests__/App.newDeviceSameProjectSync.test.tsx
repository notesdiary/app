import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB, setActiveProjectDb } from '../lib/db';
import { listAllEntries } from '../lib/entriesRepo';
import { setDriveMeta } from '../lib/metaRepo';

// A brand-new browser/device: the user re-created a project with the SAME name
// as one that already has a backup file on Drive. Local DB is empty, no filter
// rules yet (they get auto-seeded on load), no driveFolderId, no driveFileId.
const PROJECT = vi.hoisted(() => ({
  id: 'proj-new-device',
  name: 'Shared Project',
  dbName: 'test-new-device-db',
  createdAt: 0,
}));

vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [PROJECT]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async () => PROJECT),
}));

const REMOTE_ENTRIES = [
  { id: 'remote-1', date: '2026-01-02', time: '09:00', text: 'entry from the other device', createdAt: 1 },
  { id: 'remote-2', date: '2026-01-03', time: '10:00', text: 'second remote entry', createdAt: 2 },
];

const ensureProjectFolderId = vi.hoisted(() => vi.fn(async () => 'shared-folder-id'));

// Drive already holds this project's backup file, created by the other device.
const REMOTE_FILE = { id: 'remote-file-1', name: 'notesdiary-backup.json' };

const filesList = vi.fn(async (opts: { nameEquals?: string; mimeType?: string }) => {
  if (opts.mimeType === 'application/vnd.google-apps.folder') return [];
  const all = [REMOTE_FILE, OTHER_RULE_FILE];
  return opts.nameEquals ? all.filter(f => f.name === opts.nameEquals) : all;
});
// A second backup file that the other device created from a filter rule this
// browser knows nothing about (rules are local-only, never stored on Drive).
const OTHER_RULE_FILE = { id: 'remote-file-2', name: 'work.json' };
const OTHER_RULE_ENTRIES = [
  { id: 'remote-3', date: '2026-01-04', time: '11:00', text: 'entry from an unknown rule', createdAt: 3 },
];

const filesRead = vi.fn(async (fileId: string) =>
  JSON.stringify(fileId === OTHER_RULE_FILE.id ? OTHER_RULE_ENTRIES : REMOTE_ENTRIES)
);
const filesWrite = vi.fn(async () => ({ id: REMOTE_FILE.id }));
const filesRemove = vi.fn(async () => {});
const getConnection = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));
const connect = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));

const fakeProjectHandle = {
  connect,
  getConnection,
  disconnect: vi.fn(async () => {}),
  ensureFolderPath: vi.fn(async () => 'shared-folder-id'),
  files: { list: filesList, read: filesRead, write: filesWrite, remove: filesRemove },
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

describe('new device, project re-created with an existing name', () => {
  beforeEach(async () => {
    window.location.hash = `#/project/${PROJECT.id}`;
    setActiveProjectDb(PROJECT.dbName);
    const db = await getDB();
    for (const store of ['entries', 'meta'] as const) {
      const tx = db.transaction(store, 'readwrite');
      for (const key of await tx.store.getAllKeys()) {
        await tx.store.delete(key);
      }
      await tx.done;
    }
    vi.clearAllMocks();

    // Drive is connected for this project, but nothing has ever been synced here.
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });
  });

  it('pulls the existing Drive backup down to the empty local database on "Sync now"', async () => {
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);
    const syncButton = await screen.findByRole('button', { name: 'Sync now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(filesRead).toHaveBeenCalledWith(REMOTE_FILE.id);
    }, { timeout: 5000 });

    // The remote entries must land in the local database.
    await waitFor(async () => {
      setActiveProjectDb(PROJECT.dbName);
      const local = await listAllEntries();
      expect(local.map(e => e.id).sort()).toEqual(['remote-1', 'remote-2']);
    }, { timeout: 5000 });

    // ...and must not be wiped from Drive by the very same sync.
    expect(filesWrite).toHaveBeenCalledWith(expect.objectContaining({
      fileId: REMOTE_FILE.id,
      content: expect.stringContaining('remote-1'),
    }));
  });

  it('pulls the existing Drive backup down when the fresh project connects to Drive', async () => {
    // The real new-device flow: the project has just been created, so it is not
    // Drive-connected yet and has no filter rules persisted at first paint.
    setActiveProjectDb(PROJECT.dbName);
    const db = await getDB();
    const tx = db.transaction('meta', 'readwrite');
    for (const key of await tx.store.getAllKeys()) {
      await tx.store.delete(key);
    }
    await tx.done;

    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);
    const connectButton = await screen.findByRole('button', { name: 'Connect Google Drive' });
    await userEvent.click(connectButton);

    await waitFor(async () => {
      setActiveProjectDb(PROJECT.dbName);
      const local = await listAllEntries();
      expect(local.map(e => e.id).sort()).toEqual(['remote-1', 'remote-2', 'remote-3']);
    }, { timeout: 5000 });
  });

  it('pulls backup files that no local filter rule references', async () => {
    // Filter rules live only in local storage, so a browser that re-created the
    // project has just the auto-seeded remainder rule. Every backup file in the
    // project's Drive folder still belongs to this project and must come down.
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);
    const syncAllButton = await screen.findByRole('button', { name: 'Sync filters now' });
    await userEvent.click(syncAllButton);

    await waitFor(async () => {
      setActiveProjectDb(PROJECT.dbName);
      const local = await listAllEntries();
      expect(local.map(e => e.id).sort()).toEqual(['remote-1', 'remote-2', 'remote-3']);
    }, { timeout: 5000 });
  });
});
