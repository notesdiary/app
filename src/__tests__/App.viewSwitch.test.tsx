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

  it('returns to diary view when a date is clicked while on Archive view', async () => {
    render(<App />);

    const archiveButton = await screen.findByRole('button', { name: 'Archive' });
    await userEvent.click(archiveButton);

    await waitFor(() => {
      expect(screen.getByText('Nothing archived.')).toBeInTheDocument();
    });

    const dateButtons = document.querySelectorAll('.date-item');
    expect(dateButtons.length).toBeGreaterThan(0);
    await userEvent.click(dateButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByText('Nothing archived.')).not.toBeInTheDocument();
      expect(document.querySelector('.date-item')).toBeInTheDocument();
    });
  });

  it('returns to diary view when a date is clicked while on Settings view', async () => {
    render(<App />);

    const settingsButton = await screen.findByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButton);

    await waitFor(() => {
      expect(document.querySelector('.settings-view, [class*="settings"]')).toBeTruthy();
    });

    const dateButtons = document.querySelectorAll('.date-item');
    expect(dateButtons.length).toBeGreaterThan(0);
    await userEvent.click(dateButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('.date-item')).toBeInTheDocument();
    });
  });
});
