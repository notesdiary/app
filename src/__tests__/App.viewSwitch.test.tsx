import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import App from '../App';
import { getDB } from '../lib/db';

describe('App view switching', () => {
  beforeEach(async () => {
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
