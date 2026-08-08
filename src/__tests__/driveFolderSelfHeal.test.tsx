import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB, setActiveProjectDb } from '../lib/db';
import { setDriveMeta, setFilterRules } from '../lib/metaRepo';

const TEST_PROJECT = vi.hoisted(() => ({ id: 'proj-test', name: 'Test Project', dbName: 'test-driveFolderSelfHeal-db', createdAt: 0 }));

vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [TEST_PROJECT]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async () => TEST_PROJECT),
}));

// Stubs the app-wide drive-sync facade with a scriptable fake ProjectHandle,
// mirroring the shape App.tsx expects from `./drive`. This is a plain
// vi.fn()-based stub rather than the library's own `createDriveFake()`
// wiring — App.tsx's Drive calls here are simple enough (ensureFolderPath +
// files.list/write) that a real Drive-fetch fake would be more machinery
// than the test needs; drive.test.ts already exercises the real fake for
// the folderPath-pinning case.
const ensureFolderPath = vi.fn(async () => 'rediscovered-folder-id');
const ensureProjectFolderId = vi.hoisted(() => vi.fn(async () => 'rediscovered-folder-id'));
const filesList = vi.fn(async () => [] as Array<{ id: string; name?: string }>);
const filesWrite = vi.fn(async () => ({ id: 'uploaded-file-id' }));
const filesRead = vi.fn(async () => null as string | Blob | null);
const filesRemove = vi.fn(async () => {});
const getConnection = vi.fn(async () => null as { email: string; needsReauth: boolean; expiresAt: number | null } | null);
const connect = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));
const disconnect = vi.fn(async () => {});
const permissionsList = vi.fn(async () => []);
const permissionsGrant = vi.fn();
const permissionsUpdate = vi.fn();
const permissionsRevoke = vi.fn();

const fakeProjectHandle = {
  connect,
  getConnection,
  disconnect,
  ensureFolderPath,
  files: {
    list: filesList,
    read: filesRead,
    write: filesWrite,
    remove: filesRemove,
  },
  permissions: {
    list: permissionsList,
    grant: permissionsGrant,
    update: permissionsUpdate,
    revoke: permissionsRevoke,
  },
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

// Reproduces a real-world Drive connection that predates the driveFolderId
// persistence fix: driveConnected is true but driveFolderId was never saved.
describe('Drive folder ID self-heal', () => {
  beforeEach(async () => {
    window.location.hash = `#/project/${TEST_PROJECT.id}`;
    setActiveProjectDb(TEST_PROJECT.dbName);
    const db = await getDB();
    for (const store of ['entries', 'meta'] as const) {
      const tx = db.transaction(store, 'readwrite');
      const allKeys = await tx.store.getAllKeys();
      for (const key of allKeys) {
        await tx.store.delete(key);
      }
      await tx.done;
    }
    vi.clearAllMocks();

    // Simulate the broken persisted state: connected, no folder ID on disk.
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });
    await setFilterRules([
      { id: 'fr-1', filter: 'work', fileName: 'work.json', isRemainder: false },
    ]);
  });

  it('clicking Sync now on a filter rule rediscovers and persists the missing folder ID instead of throwing', async () => {
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    const syncButton = await screen.findByRole('button', { name: 'Sync now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(filesWrite).toHaveBeenCalled();
    });

    expect(ensureProjectFolderId).toHaveBeenCalledWith(TEST_PROJECT.id, TEST_PROJECT.name, false);
    expect(filesWrite).toHaveBeenCalledWith({
      folderId: 'rediscovered-folder-id',
      name: 'work.json',
      content: JSON.stringify([], null, 2),
      mimeType: 'application/json',
    });

    const persisted = await import('../lib/metaRepo').then((m) => m.getDriveMeta());
    expect(persisted.driveFolderId).toBe('rediscovered-folder-id');
  });
});
