import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import {
  createProject,
  deleteProject,
  listProjects,
  _resetRegistryForTests,
} from '../lib/projectRegistry';

describe('projectRegistry', () => {
  beforeEach(async () => {
    _resetRegistryForTests();
    // Initialize the database by opening it (triggers upgrade callback)
    const db = await openDB('notes-diary-registry', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
      },
    });
    // Clear all projects from the database
    const tx = db.transaction('projects', 'readwrite');
    const allKeys = await tx.store.getAllKeys();
    for (const key of allKeys) {
      await tx.store.delete(key);
    }
    await tx.done;
  });

  describe('createProject generates correct structure', () => {
    it('returns a project with all required fields', async () => {
      const project = await createProject('Foo');

      expect(project.name).toBe('Foo');
      expect(project.id).toBeDefined();
      expect(project.id).toMatch(/^proj-/);
      expect(project.dbName).toBe(`notes-diary-${project.id}`);
      expect(project.createdAt).toBeDefined();
      expect(typeof project.createdAt).toBe('number');
    });

    it('creates project with numeric createdAt timestamp', async () => {
      const project = await createProject('TestProject');
      const beforeTime = Date.now();
      const afterTime = Date.now();

      expect(project.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(project.createdAt).toBeLessThanOrEqual(afterTime);
    });

    it('generated id follows proj- prefix pattern', async () => {
      const project = await createProject('MyProject');

      expect(project.id).toMatch(/^proj-[a-f0-9-]{36}$/);
    });

    it('listProjects returns the created project', async () => {
      const created = await createProject('Foo');

      const projects = await listProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(created.id);
      expect(projects[0].name).toBe('Foo');
      expect(projects[0].dbName).toBe(created.dbName);
      expect(projects[0].createdAt).toBe(created.createdAt);
    });
  });

  describe('Case-insensitive name uniqueness', () => {
    it('throws when creating project with duplicate name (different case)', async () => {
      await createProject('Foo');

      await expect(createProject('foo')).rejects.toThrow(
        'A project with that name already exists'
      );
    });

    it('throws when creating project with exact duplicate name', async () => {
      await createProject('Foo');

      await expect(createProject('Foo')).rejects.toThrow(
        'A project with that name already exists'
      );
    });

    it('throws when creating project with mixed case duplicate', async () => {
      await createProject('Foo');

      await expect(createProject('FoO')).rejects.toThrow(
        'A project with that name already exists'
      );
    });
  });

  describe('Trimmed name comparison', () => {
    it('trims names before comparing for uniqueness', async () => {
      await createProject('  Foo  ');

      await expect(createProject('Foo')).rejects.toThrow(
        'A project with that name already exists'
      );
    });

    it('stores trimmed name in project', async () => {
      const project = await createProject('  Foo  ');

      expect(project.name).toBe('Foo');
    });

    it('rejects duplicate when first name has leading spaces', async () => {
      await createProject('  Foo  ');

      await expect(createProject('  Foo  ')).rejects.toThrow(
        'A project with that name already exists'
      );
    });

    it('rejects duplicate when second name has trailing spaces', async () => {
      await createProject('Foo');

      await expect(createProject('Foo   ')).rejects.toThrow(
        'A project with that name already exists'
      );
    });
  });

  describe('deleteProject removes registry row', () => {
    it('removes project from listProjects after deletion', async () => {
      const project = await createProject('Foo');

      let projects = await listProjects();
      expect(projects).toHaveLength(1);

      await deleteProject(project.id);

      projects = await listProjects();
      expect(projects).toHaveLength(0);
    });

    it('removes correct project when multiple exist', async () => {
      const project1 = await createProject('Project1');
      const project2 = await createProject('Project2');

      let projects = await listProjects();
      expect(projects).toHaveLength(2);

      await deleteProject(project1.id);

      projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(project2.id);
      expect(projects[0].name).toBe('Project2');
    });
  });

  describe('deleteProject is idempotent', () => {
    it('does not throw when deleting non-existent project', async () => {
      await expect(deleteProject('proj-unknown-id')).resolves.toBeUndefined();
    });

    it('does not throw when deleting already-deleted project', async () => {
      const project = await createProject('Foo');

      await deleteProject(project.id);
      await expect(deleteProject(project.id)).resolves.toBeUndefined();
    });

    it('safe to call deleteProject multiple times on same id', async () => {
      const project = await createProject('Foo');

      await deleteProject(project.id);
      await deleteProject(project.id);
      await deleteProject(project.id);

      const projects = await listProjects();
      expect(projects).toHaveLength(0);
    });
  });
});
