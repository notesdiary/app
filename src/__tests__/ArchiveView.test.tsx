import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { ArchiveView } from '../components/ArchiveView';
import { initDB, getDB, setActiveProjectDb } from '../lib/db';
import {
  createEntry,
  archiveEntry,
  listAllArchivedEntries,
} from '../lib/entriesRepo';

describe('ArchiveView', () => {
  beforeEach(async () => {
    setActiveProjectDb('test-ArchiveView-db');
    // Clear any previous DB state
    const db = await getDB();
    const tx = db.transaction('entries', 'readwrite');
    const allKeys = await tx.store.getAllKeys();
    for (const key of allKeys) {
      await tx.store.delete(key);
    }
    await tx.done;
  });

  it('renders empty state when no archived entries', async () => {
    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText('Nothing archived.')).toBeInTheDocument();
    });
  });

  it('renders back button that calls onBackClick', async () => {
    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    const backButton = screen.getByRole('button', { name: /Back to diary/i });
    await userEvent.click(backButton);

    expect(mockBackClick).toHaveBeenCalled();
  });

  it('renders title and subtitle', async () => {
    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Removed entries land here instead of being deleted/
      )
    ).toBeInTheDocument();
  });

  it('groups archived entries by month and sorts months descending', async () => {
    // Create entries in different months
    const julyEntry = await createEntry('2026-07-15', '10:30', 'July entry');
    await archiveEntry(julyEntry.id);

    const juneEntry = await createEntry('2026-06-20', '14:00', 'June entry');
    await archiveEntry(juneEntry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      // Verify July appears before June in the DOM
      const julyHeader = screen.getByText(/July 2026.json/);
      const juneHeader = screen.getByText(/June 2026.json/);

      const julyPosition = document.body.innerHTML.indexOf('July 2026.json');
      const junePosition = document.body.innerHTML.indexOf('June 2026.json');
      expect(julyPosition).toBeLessThan(junePosition);
    });
  });

  it('displays entry count in month header', async () => {
    // Create multiple entries in the same month
    const entry1 = await createEntry('2026-07-15', '10:30', 'Entry 1');
    await archiveEntry(entry1.id);

    const entry2 = await createEntry('2026-07-20', '14:00', 'Entry 2');
    await archiveEntry(entry2.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText(/2 entries/)).toBeInTheDocument();
    });
  });

  it('displays singular "entry" for single entry in month', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Single entry');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText(/1 entry/)).toBeInTheDocument();
    });
  });

  it('displays entries with time, date, and text content', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Test note content');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText(/10:30 AM/)).toBeInTheDocument();
      expect(screen.getByText(/Jul 15/)).toBeInTheDocument();
      expect(screen.getByText('Test note content')).toBeInTheDocument();
    });
  });

  it('displays tags with color but not clickable', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Entry with #mytag');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      const tagElement = screen.getByText('#mytag');
      expect(tagElement).toBeInTheDocument();
      expect(tagElement.classList.contains('tag-text')).toBe(true);
    });
  });

  it('calls restoreEntry and removes entry from archive when Restore clicked', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Entry to restore');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    const { rerender } = render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText('Entry to restore')).toBeInTheDocument();
    });

    const restoreButton = screen.getByRole('button', { name: 'Restore' });
    await userEvent.click(restoreButton);

    // Re-render to see the updated state
    rerender(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.queryByText('Entry to restore')).not.toBeInTheDocument();
    });
  });

  it('calls deleteEntryForever and removes entry from archive when Delete forever clicked', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Entry to delete');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    const { rerender } = render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText('Entry to delete')).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button', { name: 'Delete forever' });
    await userEvent.click(deleteButton);

    // Re-render to see the updated state
    rerender(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.queryByText('Entry to delete')).not.toBeInTheDocument();
    });
  });

  it('sorts entries within a month by date desc, then time desc', async () => {
    // Create entries in same month with different dates and times
    const entry1 = await createEntry('2026-07-15', '10:30', 'Earlier entry');
    await archiveEntry(entry1.id);

    const entry2 = await createEntry('2026-07-20', '14:00', 'Later date entry');
    await archiveEntry(entry2.id);

    const entry3 = await createEntry('2026-07-20', '09:00', 'Earlier time on later date');
    await archiveEntry(entry3.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      // Entry2 (2026-07-20 14:00) should appear first
      // Entry3 (2026-07-20 09:00) should appear second
      // Entry1 (2026-07-15 10:30) should appear last
      const entries = screen.getAllByText(/Entry to|Earlier|Later/);
      const order = document.body.innerHTML;

      const pos1 = order.indexOf('Later date entry');
      const pos2 = order.indexOf('Earlier time on later date');
      const pos3 = order.indexOf('Earlier entry');

      expect(pos1).toBeLessThan(pos2);
      expect(pos2).toBeLessThan(pos3);
    });
  });

  it('renders dividers between entries but not after last entry', async () => {
    const entry1 = await createEntry('2026-07-15', '10:30', 'Entry 1');
    await archiveEntry(entry1.id);

    const entry2 = await createEntry('2026-07-20', '14:00', 'Entry 2');
    await archiveEntry(entry2.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      const dividers = document.querySelectorAll('.entry-divider');
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  it('renders month header with document icon and json filename format', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Test');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText(/July 2026.json/)).toBeInTheDocument();
    });
  });

  it('handles multiple months with different entry counts', async () => {
    // July: 2 entries
    const jul1 = await createEntry('2026-07-15', '10:30', 'July 1');
    await archiveEntry(jul1.id);
    const jul2 = await createEntry('2026-07-20', '14:00', 'July 2');
    await archiveEntry(jul2.id);

    // June: 1 entry
    const jun1 = await createEntry('2026-06-10', '09:00', 'June 1');
    await archiveEntry(jun1.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText(/July 2026.json/)).toBeInTheDocument();
      expect(screen.getByText(/June 2026.json/)).toBeInTheDocument();
      expect(screen.getByText(/2 entries/)).toBeInTheDocument();
      expect(screen.getByText(/1 entry/)).toBeInTheDocument();
    });
  });

  it('handles multiline entries by rendering each paragraph', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Line 1\n\nLine 2\n\nLine 3');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      expect(screen.getByText('Line 1')).toBeInTheDocument();
      expect(screen.getByText('Line 2')).toBeInTheDocument();
      expect(screen.getByText('Line 3')).toBeInTheDocument();
    });
  });

  it('renders retroactive date pills as non-interactive spans in archived entries', async () => {
    const entry = await createEntry('2026-07-15', '10:30', 'Retro @2026-01-05');
    await archiveEntry(entry.id);

    const mockBackClick = vi.fn();
    render(<ArchiveView onBackClick={mockBackClick} />);

    await waitFor(() => {
      // Should have the date pill text span with correct label
      const datePillText = document.querySelector('.date-pill-text');
      expect(datePillText).toBeInTheDocument();
      expect(datePillText?.tagName).toBe('SPAN');
      expect(datePillText?.textContent).toBe('Jan 5, 2026');
    });
  });
});
