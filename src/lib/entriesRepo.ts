import { Entry } from '../types';
import { getDB } from './db';

export async function createEntry(date: string, time: string, text: string): Promise<Entry> {
  const db = await getDB();
  const id = `${date}-${time}-${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = Date.now();

  const entry: Entry = {
    id,
    date,
    time,
    text,
    archived: false,
    createdAt,
  };

  await db.add('entries', entry);
  return entry;
}

export async function updateEntryText(id: string, text: string): Promise<void> {
  const db = await getDB();

  // If text is empty or whitespace-only, delete the entry
  if (!text || !text.trim()) {
    await deleteEntryForever(id);
    return;
  }

  const entry = await db.get('entries', id);
  if (!entry) {
    throw new Error(`Entry with id ${id} not found`);
  }

  entry.text = text;
  await db.put('entries', entry);
}

export async function archiveEntry(id: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('entries', id);
  if (!entry) {
    throw new Error(`Entry with id ${id} not found`);
  }

  entry.archived = true;
  await db.put('entries', entry);
}

export async function restoreEntry(id: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('entries', id);
  if (!entry) {
    throw new Error(`Entry with id ${id} not found`);
  }

  entry.archived = false;
  await db.put('entries', entry);
}

export async function deleteEntryForever(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('entries', id);
}

export async function listAllEntries(): Promise<Entry[]> {
  const db = await getDB();
  const allEntries = await db.getAll('entries');
  return allEntries.filter(entry => !entry.archived);
}

export async function listAllArchivedEntries(): Promise<Entry[]> {
  const db = await getDB();
  const allEntries = await db.getAll('entries');
  return allEntries.filter(entry => entry.archived);
}
