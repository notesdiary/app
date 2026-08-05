import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB, setActiveProjectDb } from '../lib/db';

const TEST_PROJECT = vi.hoisted(() => ({ id: 'proj-test', name: 'Test Project', dbName: 'test-App-viewSwitch-db', createdAt: 0 }));

vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [TEST_PROJECT]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async () => TEST_PROJECT),
}));

describe('App view switching', () => {
  beforeEach(async () => {
    window.location.hash = `#/project/${TEST_PROJECT.id}`;
    setActiveProjectDb(TEST_PROJECT.dbName);
    const db = await getDB();
    const tx = db.transaction('entries', 'readwrite');
    const allKeys = await tx.store.getAllKeys();
    for (const key of allKeys) {
      await tx.store.delete(key);
    }
    await tx.done;
  });

  it('returns to diary view when back is clicked from Archive view', async () => {
    render(<App />);

    const archiveButton = await screen.findByRole('button', { name: 'Archived' });
    await userEvent.click(archiveButton);

    await waitFor(() => {
      expect(screen.getByText('Nothing archived.')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /Back/ });
    await userEvent.click(backButton);

    await waitFor(() => {
      expect(screen.queryByText('Nothing archived.')).not.toBeInTheDocument();
    });
  });

  it('returns to diary view when back is clicked from Settings view', async () => {
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    await waitFor(() => {
      expect(document.querySelector('.settings-view, [class*="settings"]')).toBeTruthy();
    });

    const backButton = screen.getByRole('button', { name: /Back/ });
    await userEvent.click(backButton);

    await waitFor(() => {
      expect(screen.queryByText('Browse by tag')).toBeInTheDocument();
    });
  });
});
