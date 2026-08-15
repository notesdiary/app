import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB, setActiveProjectDb } from '../lib/db';
import { setDriveMeta, setFilterRules } from '../lib/metaRepo';

const TEST_PROJECT = vi.hoisted(() => ({ id: 'proj-test', name: 'Test Project', dbName: 'test-driveSyncNoConnection-db', createdAt: 0 }));

vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [TEST_PROJECT]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async () => TEST_PROJECT),
}));

// getConnection() resolves null — simulates the token having been lost from
// drive-sync's own storage even though the app's local `driveConnected` meta
// still says true (e.g. revoked externally, or cleared storage).
const ensureFolderPath = vi.fn(async () => 'folder-id');
const ensureProjectFolderId = vi.hoisted(() => vi.fn(async () => 'folder-id'));
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

describe('Drive sync with no active connection', () => {
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

    // driveConnected meta says true, but getConnection() will resolve null —
    // the token is actually gone.
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });
    await setFilterRules([
      { id: 'fr-1', filter: 'work', fileName: 'work.json', isRemainder: false },
    ]);
  });

  it('clicking Sync now surfaces a reconnect prompt instead of silently failing', async () => {
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    const syncButton = await screen.findByRole('button', { name: 'Sync now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    });

    // Sync itself must not have proceeded with a missing connection.
    expect(filesWrite).not.toHaveBeenCalled();
  });
});
