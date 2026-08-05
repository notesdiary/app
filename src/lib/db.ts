import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Entry, DriveMeta } from '../types';

// Using any for schema due to idb type definition strictness
type NotesDiaryDB = any;

const dbHandles: Map<string, Promise<IDBPDatabase<NotesDiaryDB>>> = new Map();
let activeProjectDbName: string | null = null;

export async function initDB(dbName: string): Promise<IDBPDatabase<NotesDiaryDB>> {
  const openPromise = openDB<NotesDiaryDB>(dbName, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Create entries object store
      if (!db.objectStoreNames.contains('entries')) {
        const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
        entriesStore.createIndex('by-date', 'date');
      }

      // Create meta object store (key-value)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }

      // Migration: version 1 -> 2: remove by-archived index
      if (oldVersion < 2) {
        const store = transaction.objectStore('entries');
        if (store.indexNames.contains('by-archived')) {
          store.deleteIndex('by-archived');
        }
      }
    },
  });

  dbHandles.set(dbName, openPromise);
  return openPromise;
}

export async function getDB(dbName?: string): Promise<IDBPDatabase<NotesDiaryDB>> {
  const name = dbName ?? activeProjectDbName;
  if (!name) {
    throw new Error('getDB called with no dbName and no active project set');
  }

  if (!dbHandles.has(name)) {
    dbHandles.set(name, initDB(name));
  }

  return dbHandles.get(name)!;
}

export function setActiveProjectDb(dbName: string | null): void {
  activeProjectDbName = dbName;
}

export function _resetDbHandlesForTests(): void {
  dbHandles.clear();
  activeProjectDbName = null;
}
