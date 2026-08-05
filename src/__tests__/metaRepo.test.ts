import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { initDB, getDB, setActiveProjectDb } from '../lib/db';
import {
  getFilterRules,
  setFilterRules,
  getFilterSyncState,
  setFilterSyncState,
  getDriveMeta,
  setDriveMeta,
} from '../lib/metaRepo';

describe('metaRepo', () => {
  beforeEach(async () => {
    setActiveProjectDb('test-metaRepo-db');
    // Clear any previous DB state
    const db = await getDB();
    // Clear all meta entries before each test
    const tx = db.transaction('meta', 'readwrite');
    const allKeys = await tx.store.getAllKeys();
    for (const key of allKeys) {
      await tx.store.delete(key);
    }
    await tx.done;
  });

  describe('getFilterRules / setFilterRules', () => {
    it('getFilterRules() with nothing stored returns []', async () => {
      const rules = await getFilterRules();
      expect(rules).toEqual([]);
    });

    it('setFilterRules([...2 rules...]) then getFilterRules() returns the same 2 rules (deep equal)', async () => {
      const testRules = [
        {
          id: 'rule1',
          filter: 'test',
          fileName: 'test.txt',
          isRemainder: false,
        },
        {
          id: 'rule2',
          filter: 'another',
          fileName: 'another.txt',
          isRemainder: true,
        },
      ];

      await setFilterRules(testRules);
      const rules = await getFilterRules();
      expect(rules).toEqual(testRules);
    });
  });

  describe('getDriveMeta / setDriveMeta', () => {
    it('setDriveMeta merges with existing meta instead of overwriting it', async () => {
      // Simulates connectDrive() persisting connection info first...
      await setDriveMeta({ driveConnected: true, driveAccount: 'user@example.com' });
      // ...then handleDiscoverDriveFolder() persisting the folder ID afterwards.
      await setDriveMeta({ driveFolderId: 'folder-123' });

      const meta = await getDriveMeta();
      expect(meta).toEqual({
        driveConnected: true,
        driveAccount: 'user@example.com',
        driveFolderId: 'folder-123',
      });
    });
  });

  describe('getFilterSyncState / setFilterSyncState', () => {
    it('getFilterSyncState() with nothing stored returns {}', async () => {
      const state = await getFilterSyncState();
      expect(state).toEqual({});
    });

    it('setFilterSyncState({ fr1: { status: "synced", lastSynced: 123, driveFileId: "abc" } }) then getFilterSyncState() round-trips exactly', async () => {
      const testState = {
        fr1: {
          status: 'synced' as const,
          lastSynced: 123,
          driveFileId: 'abc',
        },
      };

      await setFilterSyncState(testState);
      const state = await getFilterSyncState();
      expect(state).toEqual(testState);
    });
  });
});
