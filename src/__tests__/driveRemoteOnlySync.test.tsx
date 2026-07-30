import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB } from '../lib/db';
import { setDriveMeta } from '../lib/metaRepo';
import { Entry } from '../types';

vi.mock('../lib/googleAuth', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
  requestAccessToken: vi.fn(async () => 'fake-token'),
  revokeToken: vi.fn(async () => {}),
  getAuthStatus: vi.fn(async () => ({ connected: false })),
}));

const remoteEntry: Entry = {
  id: 'remote-only-1',
  date: '2026-07-15',
  time: '09:00',
  text: 'Written directly in Drive',
  archived: false,
  createdAt: 1,
};

vi.mock('../lib/driveApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/driveApi')>('../lib/driveApi');
  return {
    ...actual,
    findOrCreateAppFolder: vi.fn(async () => 'folder-id'),
    listBackupFiles: vi.fn(async () => [{ id: 'remote-file-id', name: 'July 2026.json' }]),
    uploadMonthFile: vi.fn(async () => 'remote-file-id'),
    downloadMonthFile: vi.fn(async () => [remoteEntry]),
  };
});

import { downloadMonthFile } from '../lib/driveApi';

// Reproduces: connecting Drive when a month file exists only remotely (no
// local entries for that month) should pull its entries down into the app.
describe('Remote-only Drive entries sync back to the browser', () => {
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

  it('downloads and displays entries that exist only in Drive after connecting and Sync all now', async () => {
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    const connectButton = await screen.findByRole('button', { name: 'Connect Google Drive' });
    await userEvent.click(connectButton);

    // Discovery runs as part of connectDrive; wait for the remote-only month
    // to show up before syncing.
    await screen.findByText(/Backed up in Drive, not yet downloaded/i);

    const syncButton = await screen.findByRole('button', { name: 'Sync all now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(downloadMonthFile).toHaveBeenCalledWith('fake-token', 'remote-file-id');
    });

    const db = await getDB();
    await waitFor(async () => {
      const stored = await db.get('entries', 'remote-only-1');
      expect(stored).toBeTruthy();
    });
  });

  it('picks up a Drive-only month added since the last connection (e.g. from another device) on Sync all now', async () => {
    // Simulate an app that was already connected in a prior session, before
    // this month existed on Drive — fileSyncState has no entry for it yet.
    await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com', driveFolderId: 'folder-id' });

    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    const syncButton = await screen.findByRole('button', { name: 'Sync all now' });
    await userEvent.click(syncButton);

    await waitFor(() => {
      expect(downloadMonthFile).toHaveBeenCalledWith('fake-token', 'remote-file-id');
    });

    const db = await getDB();
    await waitFor(async () => {
      const stored = await db.get('entries', 'remote-only-1');
      expect(stored).toBeTruthy();
    });
  });
});
