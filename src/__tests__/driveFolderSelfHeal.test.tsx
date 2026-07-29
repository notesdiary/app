import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB } from '../lib/db';
import { setDriveMeta, setSyncMode, setFilterRules } from '../lib/metaRepo';

vi.mock('../lib/googleAuth', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
}));

vi.mock('../lib/driveApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/driveApi')>('../lib/driveApi');
  return {
    ...actual,
    findOrCreateAppFolder: vi.fn(async () => 'rediscovered-folder-id'),
    listBackupFiles: vi.fn(async () => []),
    uploadNamedFile: vi.fn(async () => 'uploaded-file-id'),
    uploadMonthFile: vi.fn(async () => 'uploaded-month-id'),
    downloadMonthFile: vi.fn(async () => []),
  };
});

import { findOrCreateAppFolder, uploadNamedFile } from '../lib/driveApi';
import { getDriveMeta } from '../lib/metaRepo';

// Reproduces a real-world Drive connection that predates the driveFolderId
// persistence fix: driveConnected is true but driveFolderId was never saved.
describe('Drive folder ID self-heal', () => {
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

    // Simulate the broken persisted state: connected, no folder ID on disk.
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });
    await setSyncMode('filters');
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
      expect(uploadNamedFile).toHaveBeenCalled();
    });

    expect(findOrCreateAppFolder).toHaveBeenCalledWith('fake-token');
    expect(uploadNamedFile).toHaveBeenCalledWith(
      'fake-token',
      'rediscovered-folder-id',
      'work.json',
      []
    );

    const persisted = await getDriveMeta();
    expect(persisted.driveFolderId).toBe('rediscovered-folder-id');
  });
});
