import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB, setActiveProjectDb } from '../lib/db';
import { setDriveMeta, setFilterRules } from '../lib/metaRepo';

// Two distinct local projects (distinct dbNames = distinct IndexedDBs), both
// already Drive-connected. Project A has a persisted driveFolderId from a
// prior sync; Project B has never synced, so it has none yet.
const PROJECT_A = vi.hoisted(() => ({ id: 'proj-a', name: 'Project A', dbName: 'test-switch-db-a', createdAt: 0 }));
const PROJECT_B = vi.hoisted(() => ({ id: 'proj-b', name: 'Project B', dbName: 'test-switch-db-b', createdAt: 0 }));

vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [PROJECT_A, PROJECT_B]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async (id: string) => (id === PROJECT_A.id ? PROJECT_A : PROJECT_B)),
}));

const ensureFolderPath = vi.fn(async () => 'folder-id-a');
// Each project must resolve to its OWN Drive folder id.
const ensureProjectFolderId = vi.hoisted(() =>
  vi.fn(async (projectId: string) => (projectId === 'proj-a' ? 'folder-id-a' : 'folder-id-b'))
);
const filesList = vi.fn(async () => [] as Array<{ id: string; name?: string }>);
const filesWrite = vi.fn(async () => ({ id: 'uploaded-file-id' }));
const filesRead = vi.fn(async () => null as string | Blob | null);
const filesRemove = vi.fn(async () => {});
const getConnection = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));
const connect = vi.fn(async () => ({ email: 'user@example.com', needsReauth: false, expiresAt: null }));
const disconnect = vi.fn(async () => {});
const permissionsList = vi.fn(async () => []);

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
    grant: vi.fn(),
    update: vi.fn(),
    revoke: vi.fn(),
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

// Reproduces switching from an already-synced project to a fresh, never-synced
// project within the same app session: driveFolderId in React state must not
// leak from the first project into the second.
describe('Drive folder ID does not leak across project switches', () => {
  beforeEach(async () => {
    window.location.hash = `#/project/${PROJECT_A.id}`;

    for (const dbName of [PROJECT_A.dbName, PROJECT_B.dbName]) {
      setActiveProjectDb(dbName);
      const db = await getDB();
      for (const store of ['entries', 'meta'] as const) {
        const tx = db.transaction(store, 'readwrite');
        const allKeys = await tx.store.getAllKeys();
        for (const key of allKeys) {
          await tx.store.delete(key);
        }
        await tx.done;
      }
    }
    vi.clearAllMocks();

    // Project A: already connected and already has a persisted driveFolderId.
    setActiveProjectDb(PROJECT_A.dbName);
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com', driveFolderId: 'folder-id-a' });
    await setFilterRules([
      { id: 'fr-a', filter: 'work', fileName: 'work.json', isRemainder: false },
    ]);

    // Project B: connected, but has never synced — no driveFolderId yet.
    setActiveProjectDb(PROJECT_B.dbName);
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });
    await setFilterRules([
      { id: 'fr-b', filter: 'personal', fileName: 'personal.json', isRemainder: false },
    ]);

    // Restore the DB the app itself will select via routing.
    setActiveProjectDb(PROJECT_A.dbName);
  });

  it('resolves project B\'s own Drive folder instead of reusing project A\'s cached folder id', async () => {
    render(<App />);

    // Load project A first so its driveFolderId gets cached into React state.
    const settingsButtonA = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButtonA);
    const syncButtonA = await screen.findByRole('button', { name: 'Sync now' });
    await userEvent.click(syncButtonA);
    await waitFor(() => {
      expect(filesWrite).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder-id-a' }));
    }, { timeout: 5000 });

    filesWrite.mockClear();

    // Now switch to project B, which has never synced before.
    window.location.hash = `#/project/${PROJECT_B.id}`;

    const settingsButtonB = await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 });
    await userEvent.click(settingsButtonB);
    const syncButtonB = await screen.findByRole('button', { name: 'Sync now' }, { timeout: 5000 });
    await userEvent.click(syncButtonB);

    await waitFor(() => {
      expect(filesWrite).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Project B must sync into ITS OWN folder, not project A's cached one.
    expect(filesWrite).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'folder-id-b' }));
  });
});
