import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import * as entriesRepo from '../lib/entriesRepo';
import * as metaRepo from '../lib/metaRepo';
import { Entry } from '../types';

const TEST_PROJECT = vi.hoisted(() => ({ id: 'proj-test', name: 'Test Project', dbName: 'test-App-db', createdAt: 0 }));

// Mock all the dependencies
vi.mock('../lib/entriesRepo');
vi.mock('../lib/metaRepo');
vi.mock('../lib/projectRegistry', () => ({
  listProjects: vi.fn(async () => [TEST_PROJECT]),
  migrateLegacyDbIfNeeded: vi.fn(async () => {}),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(async () => TEST_PROJECT),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = `#/project/${TEST_PROJECT.id}`;
  });

  describe('Filter rules auto-seeding', () => {
    it('on mount with empty filter rules in IndexedDB, the app auto-seeds one default remainder rule', async () => {
      // Mock the metaRepo functions
      vi.mocked(metaRepo.getFilterRules).mockResolvedValueOnce([]);
      vi.mocked(metaRepo.setFilterRules).mockResolvedValueOnce(undefined);
      vi.mocked(metaRepo.getFilterSyncState).mockResolvedValueOnce({});
      vi.mocked(metaRepo.getDriveMeta).mockResolvedValueOnce({
        driveConnected: false,
      });

      // Mock the entriesRepo functions
      vi.mocked(entriesRepo.listAllEntries).mockResolvedValueOnce([]);

      render(<App />);

      // Wait for the component to mount and process the filter rules
      await waitFor(() => {
        expect(metaRepo.getFilterRules).toHaveBeenCalled();
      });

      // Verify that setFilterRules was called with a seeded remainder rule
      await waitFor(() => {
        expect(metaRepo.setFilterRules).toHaveBeenCalled();
        const callArgs = vi.mocked(metaRepo.setFilterRules).mock.calls[0];
        const seededRules = callArgs[0];

        // Verify the seeded rules have the expected structure
        expect(seededRules).toHaveLength(1);
        expect(seededRules[0]).toEqual({
          id: expect.stringMatching(/^fr-/),
          filter: '',
          fileName: 'notesdiary-backup.json',
          isRemainder: true,
        });
      });
    });
  });

  describe('Date selection filter', () => {
    it('clicking a date in Browse by date filters entry list down; clicking same date again clears filter (toggle)', async () => {
      const user = userEvent.setup();

      // Create mock entries: one with dated section, one without
      const mockEntries: Entry[] = [
        {
          id: 'entry-1',
          date: '2024-01-15',
          time: '10:30',
          text: 'Entry with date\n\n@2024-02-20',
          archived: false,
          createdAt: 1705324200000,
        },
        {
          id: 'entry-2',
          date: '2024-01-16',
          time: '14:45',
          text: 'Another entry',
          archived: false,
          createdAt: 1705410600000,
        },
      ];

      // Mock the metaRepo functions
      vi.mocked(metaRepo.getFilterRules).mockResolvedValueOnce([]);
      vi.mocked(metaRepo.setFilterRules).mockResolvedValueOnce(undefined);
      vi.mocked(metaRepo.getFilterSyncState).mockResolvedValueOnce({});
      vi.mocked(metaRepo.getDriveMeta).mockResolvedValueOnce({
        driveConnected: false,
      });

      // Mock the entriesRepo functions
      vi.mocked(entriesRepo.listAllEntries).mockResolvedValueOnce(mockEntries);
      vi.mocked(entriesRepo.countArchivedEntries).mockResolvedValueOnce(0);

      const { rerender } = render(<App />);

      // Wait for the app to load entries
      await waitFor(() => {
        expect(entriesRepo.listAllEntries).toHaveBeenCalled();
      });

      // Find the date browser section in the left rail
      const dateBrowserSection = screen.getByText('Browse by date').closest('.browse-by-date-section') as HTMLElement;
      expect(dateBrowserSection).toBeTruthy();

      // Find the date button within the date browser section
      const dateButton = within(dateBrowserSection).getByRole('button', { name: /Feb 20, 2024/ });
      expect(dateButton).toBeTruthy();

      // Verify the date button is initially not selected
      expect(dateButton).not.toHaveClass('selected');

      // Click the date to apply the filter
      await user.click(dateButton);

      // After clicking, the filter should be active and the date button should be selected
      await waitFor(() => {
        expect(dateButton).toHaveClass('selected');
      });

      // Verify the date filter is active - the entry-row should still be visible
      const entryRow = screen.getByRole('button', { name: '×' }).closest('.entry-row');
      expect(entryRow).toBeTruthy(); // The entry should still be rendered

      // Now click the same date again to toggle (deselect the filter)
      await user.click(dateButton);

      // After clicking again, the filter should be cleared and the date button should be deselected
      await waitFor(() => {
        expect(dateButton).not.toHaveClass('selected');
      });
    });
  });
});
