import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { initDB, _resetDbHandlesForTests } from '../lib/db';
import {
  _resetRegistryForTests,
  _clearRegistryForTests,
  migrateLegacyDbIfNeeded,
  listProjects,
  createProject,
} from '../lib/projectRegistry';

describe('projectRegistryMigration', () => {
  beforeEach(async () => {
    // Reset the database handles and registry for each test
    _resetDbHandlesForTests();
    _resetRegistryForTests();
    // Clear the registry data
    await _clearRegistryForTests();
  });

  describe('No migration when no legacy database exists', () => {
    it('should not create any projects when legacy database does not exist', async () => {
      // Don't create the legacy database (simulates fresh install)
      // This test runs first, so the legacy database doesn't exist yet

      // Call the migration
      await migrateLegacyDbIfNeeded();

      // Verify no projects were created
      const projects = await listProjects();
      expect(projects).toHaveLength(0);
    });
  });

  describe('Migration creates row for legacy database', () => {
    it('should create a "My Notes" project with dbName "notes-diary" when legacy database exists', async () => {
      // Pre-create the legacy database (simulates existing user's database)
      await initDB('notes-diary');

      // Reset the registry to empty state
      _resetRegistryForTests();

      // Call the migration
      await migrateLegacyDbIfNeeded();

      // Verify the project was created
      const projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'My Notes',
        dbName: 'notes-diary',
      });
      // Verify the project has required fields
      expect(projects[0].id).toBeDefined();
      expect(projects[0].createdAt).toBeDefined();
    });
  });

  describe('Migration is idempotent', () => {
    it('should not create duplicate projects when called multiple times', async () => {
      // Pre-create the legacy database
      await initDB('notes-diary');

      // Reset the registry to empty state
      _resetRegistryForTests();

      // Call the migration twice
      await migrateLegacyDbIfNeeded();
      await migrateLegacyDbIfNeeded();

      // Verify only one project exists (not two)
      const projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'My Notes',
        dbName: 'notes-diary',
      });
    });
  });

  describe('No migration when registry already has projects', () => {
    it('should not create projects if registry already has entries', async () => {
      // Pre-create the legacy database (simulate legacy install)
      await initDB('notes-diary');

      // Create a project in the registry manually
      await createProject('Something');

      // Reset the registry cache but NOT the data
      _resetRegistryForTests();

      // Call the migration
      await migrateLegacyDbIfNeeded();

      // Verify the existing project is still there unchanged — migration is a no-op
      const projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Something');
      // Should not have 'My Notes' created
      expect(projects.some(p => p.name === 'My Notes')).toBe(false);
    });
  });
});
