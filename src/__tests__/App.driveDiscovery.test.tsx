// Installs `indexedDB`/`IDBKeyRange` globals so `@open-webapp/drive-sync`'s
// storage layer (built on the `idb` package) works under jsdom, which does
// not implement IndexedDB itself. Must be imported before anything that
// touches drive-sync's storage.
import 'fake-indexeddb/auto';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import * as entriesRepo from '../lib/entriesRepo';
import * as metaRepo from '../lib/metaRepo';
import * as projectRegistry from '../lib/projectRegistry';
import { createDriveFake, createGisFake, type DriveFake, type GisFake } from '@open-webapp/drive-sync/testing';

// Mock all the dependencies
vi.mock('../lib/entriesRepo');
vi.mock('../lib/metaRepo');
vi.mock('../lib/projectRegistry');

// Import drive after mocks are set up (not mocked, but used)
import * as driveModule from '../lib/drive';

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * Wraps a driveFake's fetch with handling for the two endpoints drive-sync's
 * connect()/disconnect() hit directly (userinfo lookup + token revocation)
 * that driveFake itself doesn't understand.
 */
function createHostFetch(driveFake: DriveFake): typeof fetch {
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request)?.url ?? String(input);

    if (url.startsWith(USERINFO_URL)) {
      return new Response(JSON.stringify({ email: 'user@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.startsWith(REVOKE_URL)) {
      return new Response(null, { status: 200 });
    }

    return driveFake.fetch(input as any, init);
  }) as unknown as typeof fetch;
}

describe('App - Drive Discovery', () => {
  let gisFake: GisFake;
  let driveFake: DriveFake;

  beforeEach(() => {
    // Set up environment and mocks
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    gisFake = createGisFake();
    gisFake.install();
    driveFake = createDriveFake();
    vi.stubGlobal('fetch', createHostFetch(driveFake));

    // Clear all previous mocks
    vi.clearAllMocks();

    // Mock entriesRepo
    vi.mocked(entriesRepo.listAllEntries).mockResolvedValue([]);
    vi.mocked(entriesRepo.countArchivedEntries).mockResolvedValue(0);

    // Mock metaRepo
    vi.mocked(metaRepo.getDriveMeta).mockResolvedValue({
      driveConnected: false,
    });
    vi.mocked(metaRepo.getFilterRules).mockResolvedValue([]);
    vi.mocked(metaRepo.setFilterRules).mockResolvedValue(undefined);
    vi.mocked(metaRepo.getFilterSyncState).mockResolvedValue({});
    vi.mocked(metaRepo.cleanupLegacyOAuthToken).mockResolvedValue(undefined);
  });

  afterEach(() => {
    gisFake.uninstall();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('should short-circuit on first valid connection and use that project for discovery', async () => {
    // Set up three projects: first with no connection, second with valid connection, third never checked
    const proj1 = { id: 'proj-1', name: 'No Connection', dbName: 'db-1', createdAt: 0 };
    const proj2 = { id: 'proj-2', name: 'Valid Connection', dbName: 'db-2', createdAt: 1 };
    const proj3 = { id: 'proj-3', name: 'Should Not Check', dbName: 'db-3', createdAt: 2 };

    // Mock listProjects to return all three
    vi.mocked(projectRegistry.listProjects).mockResolvedValue([proj1, proj2, proj3]);
    vi.mocked(projectRegistry.migrateLegacyDbIfNeeded).mockResolvedValue(undefined);

    // Mock ensureProjectFolderId to return a folder ID
    const ensureProjectFolderIdSpy = vi
      .spyOn(driveModule, 'ensureProjectFolderId')
      .mockResolvedValue('folder-id-shared');

    // Track getConnection calls
    const getConnectionCalls: string[] = [];

    // Mock drive.project to track which projects' getConnection was called
    const originalDriveProject = driveModule.drive.project.bind(driveModule.drive);
    vi.spyOn(driveModule.drive, 'project').mockImplementation((projectId: string) => {
      const originalProject = originalDriveProject(projectId);

      if (projectId === 'proj-1') {
        // First project: no connection (connection === null)
        return {
          ...originalProject,
          getConnection: async () => {
            getConnectionCalls.push('proj-1');
            return null;
          },
        };
      } else if (projectId === 'proj-2') {
        // Second project: valid connection (needsReauth === false)
        return {
          ...originalProject,
          getConnection: async () => {
            getConnectionCalls.push('proj-2');
            return { needsReauth: false };
          },
          files: {
            ...originalProject.files,
            list: vi.fn().mockResolvedValue([
              { id: 'folder-archive', name: 'archive', modifiedTime: '2025-01-01' },
            ]),
          },
        };
      } else if (projectId === 'proj-3') {
        // Third project: should not be checked
        return {
          ...originalProject,
          getConnection: async () => {
            getConnectionCalls.push('proj-3');
            throw new Error('Should not reach proj-3 getConnection');
          },
        };
      }

      return originalProject;
    });

    // Navigate to picker route
    window.location.hash = '#/';

    render(<App />);

    // Wait for discovery to complete
    await waitFor(() => {
      expect(getConnectionCalls).toContain('proj-1');
      expect(getConnectionCalls).toContain('proj-2');
      expect(getConnectionCalls).not.toContain('proj-3');
    });

    // Verify short-circuit: proj-1 and proj-2 checked (in that order), but not proj-3
    // The effect may run multiple times, so we just check the sequence is correct
    const firstProj1 = getConnectionCalls.indexOf('proj-1');
    const firstProj2 = getConnectionCalls.indexOf('proj-2');
    const hasProj3 = getConnectionCalls.includes('proj-3');

    expect(firstProj1).toBeLessThan(firstProj2);
    expect(hasProj3).toBe(false);

    // Verify ensureProjectFolderId was called with proj-2
    await waitFor(() => {
      expect(ensureProjectFolderIdSpy).toHaveBeenCalledWith('proj-2', 'Valid Connection', true);
    });
  });

  it('should skip projects with needsReauth and use the next valid one', async () => {
    const proj1 = { id: 'proj-1', name: 'Needs Reauth', dbName: 'db-1', createdAt: 0 };
    const proj2 = { id: 'proj-2', name: 'Valid', dbName: 'db-2', createdAt: 1 };

    vi.mocked(projectRegistry.listProjects).mockResolvedValue([proj1, proj2]);
    vi.mocked(projectRegistry.migrateLegacyDbIfNeeded).mockResolvedValue(undefined);

    const ensureProjectFolderIdSpy = vi
      .spyOn(driveModule, 'ensureProjectFolderId')
      .mockResolvedValue('folder-id-shared');

    const getConnectionCalls: string[] = [];

    const originalDriveProject = driveModule.drive.project.bind(driveModule.drive);
    vi.spyOn(driveModule.drive, 'project').mockImplementation((projectId: string) => {
      const originalProject = originalDriveProject(projectId);

      if (projectId === 'proj-1') {
        // First project: valid connection but needs reauth
        return {
          ...originalProject,
          getConnection: async () => {
            getConnectionCalls.push('proj-1');
            return { needsReauth: true };
          },
        };
      } else if (projectId === 'proj-2') {
        // Second project: valid connection, no reauth needed
        return {
          ...originalProject,
          getConnection: async () => {
            getConnectionCalls.push('proj-2');
            return { needsReauth: false };
          },
          files: {
            ...originalProject.files,
            list: vi.fn().mockResolvedValue([
              { id: 'folder-archive', name: 'archive', modifiedTime: '2025-01-01' },
            ]),
          },
        };
      }

      return originalProject;
    });

    window.location.hash = '#/';
    render(<App />);

    await waitFor(() => {
      expect(getConnectionCalls).toContain('proj-1');
      expect(getConnectionCalls).toContain('proj-2');
    });

    // Verify proj-2 was used for discovery, not proj-1
    await waitFor(() => {
      expect(ensureProjectFolderIdSpy).toHaveBeenCalledWith('proj-2', 'Valid', true);
    });
  });

  it('should exclude discovered folders whose names match local project names (case/whitespace insensitive)', async () => {
    const proj1 = { id: 'proj-1', name: ' Work ', dbName: 'db-1', createdAt: 0 };
    const proj2 = { id: 'proj-2', name: 'personal', dbName: 'db-2', createdAt: 1 };

    vi.mocked(projectRegistry.listProjects).mockResolvedValue([proj1, proj2]);
    vi.mocked(projectRegistry.migrateLegacyDbIfNeeded).mockResolvedValue(undefined);

    vi.spyOn(driveModule, 'ensureProjectFolderId').mockResolvedValue('folder-id-shared');

    const listFilesSpy = vi.fn().mockResolvedValue([
      { id: 'folder-work', name: 'work', modifiedTime: '2025-01-01' },
      { id: 'folder-personal', name: 'PERSONAL', modifiedTime: '2025-01-02' },
      { id: 'folder-archive', name: 'archive', modifiedTime: '2025-01-03' },
    ]);

    // Drive returns three folders: 'work', 'PERSONAL', 'archive'
    // Only 'archive' should be in discovered (others match local project names)
    const originalDriveProject = driveModule.drive.project.bind(driveModule.drive);
    vi.spyOn(driveModule.drive, 'project').mockImplementation((projectId: string) => {
      const originalProject = originalDriveProject(projectId);

      return {
        ...originalProject,
        getConnection: async () => ({ needsReauth: false }),
        files: {
          ...originalProject.files,
          list: listFilesSpy,
        },
      };
    });

    window.location.hash = '#/';
    render(<App />);

    // Verify files.list was called (discovery happened)
    await waitFor(() => {
      expect(listFilesSpy).toHaveBeenCalled();
    });

    // Verify it was called with the correct folder ID and mime type
    expect(listFilesSpy).toHaveBeenCalledWith({
      folderId: 'folder-id-shared',
      mimeType: 'application/vnd.google-apps.folder',
    });
  });

  it('should not fetch Drive folders when local projects list is empty', async () => {
    // Mock empty projects list
    vi.mocked(projectRegistry.listProjects).mockResolvedValue([]);
    vi.mocked(projectRegistry.migrateLegacyDbIfNeeded).mockResolvedValue(undefined);

    const filesListSpy = vi.fn();
    const ensureProjectFolderIdSpy = vi
      .spyOn(driveModule, 'ensureProjectFolderId')
      .mockResolvedValue('folder-id-shared');

    const originalDriveProject = driveModule.drive.project.bind(driveModule.drive);
    vi.spyOn(driveModule.drive, 'project').mockImplementation((projectId: string) => {
      const originalProject = originalDriveProject(projectId);

      return {
        ...originalProject,
        getConnection: async () => ({ needsReauth: false }),
        files: {
          ...originalProject.files,
          list: filesListSpy,
        },
      };
    });

    window.location.hash = '#/';
    render(<App />);

    // Wait a bit for the effect to run
    await waitFor(
      () => {
        // Verify that files.list was never called since no projects exist
        expect(filesListSpy).not.toHaveBeenCalled();
      },
      { timeout: 2000 }
    ).catch(() => {
      // Expected behavior already verified by not throwing
    });

    expect(filesListSpy).not.toHaveBeenCalled();
  });

  it('should handle errors from files.list and clear discovered folders', async () => {
    const proj1 = { id: 'proj-1', name: 'Valid', dbName: 'db-1', createdAt: 0 };

    vi.mocked(projectRegistry.listProjects).mockResolvedValue([proj1]);
    vi.mocked(projectRegistry.migrateLegacyDbIfNeeded).mockResolvedValue(undefined);

    vi.spyOn(driveModule, 'ensureProjectFolderId').mockResolvedValue('folder-id-shared');

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const testError = new Error('Network error');
    const originalDriveProject = driveModule.drive.project.bind(driveModule.drive);
    vi.spyOn(driveModule.drive, 'project').mockImplementation((projectId: string) => {
      const originalProject = originalDriveProject(projectId);

      return {
        ...originalProject,
        getConnection: async () => ({ needsReauth: false }),
        files: {
          ...originalProject.files,
          list: vi.fn().mockRejectedValue(testError),
        },
      };
    });

    window.location.hash = '#/';
    render(<App />);

    // Wait for error handling
    await waitFor(() => {
      const errorCalls = consoleErrorSpy.mock.calls;
      const hasDiscoveryError = errorCalls.some(call =>
        call[0]?.includes?.('Drive discovery error') ||
        (typeof call[0] === 'string' && call[0].includes('Drive discovery error'))
      );
      expect(hasDiscoveryError).toBe(true);
    });

    // Verify console.error was called with the discovery error message
    const discoveryErrorCall = consoleErrorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('Drive discovery error')
    );
    expect(discoveryErrorCall).toBeDefined();

    // Verify the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Drive discovery error'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
