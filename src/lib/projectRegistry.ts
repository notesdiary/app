import { openDB, IDBPDatabase } from 'idb';
import { Project } from '../types';
import { drive } from './drive';

const REGISTRY_DB_NAME = 'notes-diary-registry';
let registryDb: Promise<IDBPDatabase<any>> | null = null;

function getRegistryDb(): Promise<IDBPDatabase<any>> {
  if (!registryDb) {
    registryDb = openDB(REGISTRY_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
      },
    });
  }
  return registryDb;
}

export async function listProjects(): Promise<Project[]> {
  const db = await getRegistryDb();
  return db.getAll('projects');
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getRegistryDb();
  return db.get('projects', id);
}

export async function createProject(name: string): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name cannot be empty');
  const existing = await listProjects();
  if (existing.some(p => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A project with that name already exists');
  }
  const id = 'proj-' + crypto.randomUUID();
  const project: Project = { id, name: trimmed, dbName: `notes-diary-${id}`, createdAt: Date.now() };
  const db = await getRegistryDb();
  await db.put('projects', project);
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  if (!project) return;
  const db = await getRegistryDb();
  await db.delete('projects', id);
  indexedDB.deleteDatabase(project.dbName);
  // Drops the drive-sync library's own per-project auth IndexedDB database
  // (a separate database from this app's `project.dbName`, deleted above).
  await drive.dropProject(id);
}

export function _resetRegistryForTests(): void {
  registryDb = null;
}

export async function _clearRegistryForTests(): Promise<void> {
  const db = await getRegistryDb();
  if (db.objectStoreNames.contains('projects')) {
    const tx = db.transaction('projects', 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}

const LEGACY_DB_NAME = 'notes-diary';
const MIGRATED_PROJECT_NAME = 'My Notes';

async function legacyDbExists(): Promise<boolean> {
  if (!('databases' in indexedDB)) {
    // Fallback for browsers without indexedDB.databases(): assume it might
    // exist and let openDB's upgrade-noop path confirm harmlessly is not
    // safe here (would create it), so just check via databases() only —
    // if unsupported, treat as "no legacy db" rather than risk creating one.
    return false;
  }
  const dbs = await indexedDB.databases();
  return dbs.some(d => d.name === LEGACY_DB_NAME);
}

export async function migrateLegacyDbIfNeeded(): Promise<void> {
  const projects = await listProjects();
  if (projects.length > 0) return; // registry already seeded, never re-seed
  if (!(await legacyDbExists())) return;

  const db = await getRegistryDb();
  const project: Project = {
    id: 'proj-' + crypto.randomUUID(),
    name: MIGRATED_PROJECT_NAME,
    dbName: LEGACY_DB_NAME,
    createdAt: Date.now(),
  };
  await db.put('projects', project);
}
