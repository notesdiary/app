import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB } from '../lib/db';
import { setDriveMeta, getFileSyncState } from '../lib/metaRepo';
import { putEntries } from '../lib/entriesRepo';
import { Entry } from '../types';

vi.mock('../lib/googleAuth', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
  requestAccessToken: vi.fn(async () => 'fake-token'),
  revokeToken: vi.fn(async () => {}),
  getAuthStatus: vi.fn(async () => ({ connected: false })),
}));

const localEntry: Entry = {
  id: 'local-1',
  date: '2026-07-15',
  time: '09:00',
  text: 'Written locally',
  archived: false,
  createdAt: 1,
};

vi.mock('../lib/driveApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/driveApi')>('../lib/driveApi');
  return {
    ...actual,
    findOrCreateAppFolder: vi.fn(async () => 'folder-id'),
    listBackupFiles: vi.fn(async () => []),
    uploadMonthFile: vi.fn(async () => 'new-remote-file-id'),
    downloadMonthFile: vi.fn(async () => []),
  };
});

import { uploadMonthFile } from '../lib/driveApi';

// Reproduces: after a month is first uploaded to Drive (creating a new
// remote file), the resulting driveFileId must be persisted to metaRepo —
// not just held in in-memory React state — so the next sync merges with
// the existing Drive file instead of blindly creating a duplicate.
describe('fileSyncState persists driveFileId after first upload', () => {
  beforeEach(async () => {
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
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: { emailAddress: 'user@example.com' } }),
    })) as any;
  });

  it('writes the new driveFileId to persisted storage, not just React state', async () => {
    await putEntries([localEntry]);
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com', driveFolderId: 'folder-id' });

    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    const syncButton = await screen.findByRole('button', { name: 'Sync all now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(uploadMonthFile).toHaveBeenCalled();
    });

    await waitFor(async () => {
      const state = await getFileSyncState();
      expect(state['2026-07']?.driveFileId).toBe('new-remote-file-id');
    });
  });
});
