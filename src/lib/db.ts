import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Entry, DriveMeta } from '../types';

// Using any for schema due to idb type definition strictness
type NotesDiaryDB = any;

let db: IDBPDatabase<NotesDiaryDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<NotesDiaryDB>> {
  if (db) {
    return db;
  }

  db = await openDB<NotesDiaryDB>('notes-diary', 2, {
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

  return db;
}

export async function getDB(): Promise<IDBPDatabase<NotesDiaryDB>> {
  if (!db) {
    return initDB();
  }
  return db;
}
