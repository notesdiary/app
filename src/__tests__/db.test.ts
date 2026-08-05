import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { initDB, getDB, setActiveProjectDb, _resetDbHandlesForTests } from '../lib/db';

describe('db - Map-based multi-database support', () => {
  beforeEach(() => {
    // Reset both dbHandles Map and activeProjectDbName before each test
    _resetDbHandlesForTests();
  });

  describe('initDB opens distinct databases', () => {
    it('should open two distinct databases with different names', async () => {
      const dbA = await initDB('db-a');
      const dbB = await initDB('db-b');

      expect(dbA).toBeDefined();
      expect(dbB).toBeDefined();
      expect(dbA.name).toBe('db-a');
      expect(dbB.name).toBe('db-b');
    });
  });

  describe('getDB() with activeProjectDbName', () => {
    it('should return database for active project when called with no arguments', async () => {
      setActiveProjectDb('db-a');

      const db = await getDB();

      expect(db).toBeDefined();
      expect(db.name).toBe('db-a');
    });

    it('should return different database when activeProjectDbName changes', async () => {
      setActiveProjectDb('db-a');
      const dbA = await getDB();
      expect(dbA.name).toBe('db-a');

      setActiveProjectDb('db-b');
      const dbB = await getDB();
      expect(dbB.name).toBe('db-b');

      // Verify they are distinct
      expect(dbA.name).not.toBe(dbB.name);
    });
  });

  describe('getDB() without active project', () => {
    it('should throw error when called with no dbName and no active project set', async () => {
      // Don't set activeProjectDbName
      await expect(getDB()).rejects.toThrow(
        'getDB called with no dbName and no active project set'
      );
    });
  });

  describe('getDB(dbName) with explicit argument', () => {
    it('should use explicit dbName parameter independent of active project', async () => {
      setActiveProjectDb('db-a');

      const db = await getDB('db-c');

      expect(db).toBeDefined();
      expect(db.name).toBe('db-c');
    });

    it('should ignore activeProjectDbName when explicit dbName is provided', async () => {
      setActiveProjectDb('db-a');
      const activeDb = await getDB();
      expect(activeDb.name).toBe('db-a');

      // Request a different database explicitly
      const explicitDb = await getDB('db-x');
      expect(explicitDb.name).toBe('db-x');

      // Verify they are different
      expect(activeDb.name).not.toBe(explicitDb.name);
    });

    it('should return same database instance for same dbName on multiple calls', async () => {
      const db1 = await getDB('db-test');
      const db2 = await getDB('db-test');

      expect(db1).toBe(db2);
      expect(db1.name).toBe('db-test');
      expect(db2.name).toBe('db-test');
    });
  });

  describe('Multi-database isolation', () => {
    it('should maintain separate database handles in the Map', async () => {
      const dbA = await initDB('db-a');
      const dbB = await initDB('db-b');
      const dbC = await initDB('db-c');

      expect(dbA.name).toBe('db-a');
      expect(dbB.name).toBe('db-b');
      expect(dbC.name).toBe('db-c');

      // Each call to getDB with explicit name should return correct database
      expect((await getDB('db-a')).name).toBe('db-a');
      expect((await getDB('db-b')).name).toBe('db-b');
      expect((await getDB('db-c')).name).toBe('db-c');
    });

    it('should handle activeProjectDbName switching with multiple databases', async () => {
      await initDB('project-1');
      await initDB('project-2');

      setActiveProjectDb('project-1');
      expect((await getDB()).name).toBe('project-1');

      setActiveProjectDb('project-2');
      expect((await getDB()).name).toBe('project-2');

      // Verify explicit calls still work
      expect((await getDB('project-1')).name).toBe('project-1');
      expect((await getDB('project-2')).name).toBe('project-2');
    });
  });
});
