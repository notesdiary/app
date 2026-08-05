import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import * as entriesRepo from '../lib/entriesRepo';
import * as metaRepo from '../lib/metaRepo';
import * as googleAuth from '../lib/googleAuth';
import * as driveApi from '../lib/driveApi';

const TEST_PROJECT = vi.hoisted(() => ({ id: 'proj-test', name: 'Test Project', dbName: 'test-App-db', createdAt: 0 }));

// Mock all the dependencies
vi.mock('../lib/entriesRepo');
vi.mock('../lib/metaRepo');
vi.mock('../lib/googleAuth');
vi.mock('../lib/driveApi');
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

      // Mock the googleAuth functions
      vi.mocked(googleAuth.getAuthStatus).mockResolvedValueOnce({
        authenticated: false,
        cachedToken: false,
      });

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
});
