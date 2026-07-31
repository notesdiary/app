import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Entry, DriveMeta } from '../types';

// Using any for schema due to idb type definition strictness
type NotesDiaryDB = any;

let db: IDBPDatabase<NotesDiaryDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<NotesDiaryDB>> {
  if (db) {
    return db;
  }

  db = await openDB<NotesDiaryDB>('notes-diary', 1, {
    upgrade(db) {
      // Create entries object store
      if (!db.objectStoreNames.contains('entries')) {
        const entriesStore = db.createObjectStore('entries', { keyPath: 'id' });
        entriesStore.createIndex('by-date', 'date');
        entriesStore.createIndex('by-archived', 'archived');
      }

      // Create meta object store (key-value)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
  });

  return db;
}

export async function getDB(): Promise<IDBPDatabase<NotesDiaryDB>> {
  if (!db) {
    return initDB();
  }
  return db;
}
