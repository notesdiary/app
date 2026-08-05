import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { initDB, getDB, setActiveProjectDb } from '../lib/db';
import {
  createEntry,
  updateEntryText,
  archiveEntry,
  restoreEntry,
  deleteEntryForever,
  listAllEntries,
  listAllArchivedEntries,
  countArchivedEntries,
} from '../lib/entriesRepo';

describe('entriesRepo', () => {
  beforeEach(async () => {
    setActiveProjectDb('test-entriesRepo-db');
    // Clear any previous DB state
    const db = await getDB();
    // Clear all entries before each test
    const tx = db.transaction('entries', 'readwrite');
    const allKeys = await tx.store.getAllKeys();
    for (const key of allKeys) {
      await tx.store.delete(key);
    }
    await tx.done;
  });

  it('creates an entry and appears in listAllEntries', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Test note');

    expect(entry.id).toBeDefined();
    expect(entry.date).toBe('2024-01-15');
    expect(entry.time).toBe('10:30');
    expect(entry.text).toBe('Test note');
    expect(entry.archived).toBe(false);
    expect(entry.createdAt).toBeDefined();

    const allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(1);
    expect(allEntries[0].id).toBe(entry.id);
  });

  it('updates entry text', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Original text');
    const entryId = entry.id;

    await updateEntryText(entryId, 'Updated text');

    const allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(1);
    expect(allEntries[0].text).toBe('Updated text');
  });

  it('deletes entry when updating text to whitespace-only', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Original text');
    const entryId = entry.id;

    await updateEntryText(entryId, '   ');

    const allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(0);
  });

  it('deletes entry when updating text to empty string', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Original text');
    const entryId = entry.id;

    await updateEntryText(entryId, '');

    const allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(0);
  });

  it('archives entry and excludes from active list', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Test note');
    const entryId = entry.id;

    await archiveEntry(entryId);

    const activeEntries = await listAllEntries();
    expect(activeEntries).toHaveLength(0);

    const archivedEntries = await listAllArchivedEntries();
    expect(archivedEntries).toHaveLength(1);
    expect(archivedEntries[0].id).toBe(entryId);
    expect(archivedEntries[0].archived).toBe(true);
  });

  it('restores archived entry to active list', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Test note');
    const entryId = entry.id;

    await archiveEntry(entryId);
    let activeEntries = await listAllEntries();
    expect(activeEntries).toHaveLength(0);

    await restoreEntry(entryId);

    activeEntries = await listAllEntries();
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0].id).toBe(entryId);
    expect(activeEntries[0].archived).toBe(false);
  });

  it('deletes entry forever', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Test note');
    const entryId = entry.id;

    await deleteEntryForever(entryId);

    const allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(0);

    const archivedEntries = await listAllArchivedEntries();
    expect(archivedEntries).toHaveLength(0);
  });

  it('handles multiple entries correctly', async () => {
    await createEntry('2024-01-15', '10:30', 'Note 1');
    await createEntry('2024-01-15', '14:00', 'Note 2');
    const entry3 = await createEntry('2024-01-16', '09:00', 'Note 3');

    let allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(3);

    await archiveEntry(entry3.id);

    allEntries = await listAllEntries();
    expect(allEntries).toHaveLength(2);

    const archivedEntries = await listAllArchivedEntries();
    expect(archivedEntries).toHaveLength(1);
  });

  it('preserves entry properties during update', async () => {
    const entry = await createEntry('2024-01-15', '10:30', 'Original');
    const originalCreatedAt = entry.createdAt;
    const entryId = entry.id;

    await updateEntryText(entryId, 'Updated');

    const allEntries = await listAllEntries();
    expect(allEntries[0].createdAt).toBe(originalCreatedAt);
    expect(allEntries[0].date).toBe('2024-01-15');
    expect(allEntries[0].time).toBe('10:30');
    expect(allEntries[0].archived).toBe(false);
  });

  it('throws error when updating non-existent entry', async () => {
    await expect(updateEntryText('non-existent-id', 'text')).rejects.toThrow(
      'Entry with id non-existent-id not found'
    );
  });

  it('throws error when archiving non-existent entry', async () => {
    await expect(archiveEntry('non-existent-id')).rejects.toThrow(
      'Entry with id non-existent-id not found'
    );
  });

  it('throws error when restoring non-existent entry', async () => {
    await expect(restoreEntry('non-existent-id')).rejects.toThrow(
      'Entry with id non-existent-id not found'
    );
  });

  it('counts archived entries: 5 entries with 2 archived returns 2', async () => {
    const entry1 = await createEntry('2024-01-15', '10:30', 'Note 1');
    const entry2 = await createEntry('2024-01-15', '11:30', 'Note 2');
    const entry3 = await createEntry('2024-01-15', '12:30', 'Note 3');
    const entry4 = await createEntry('2024-01-15', '13:30', 'Note 4');
    const entry5 = await createEntry('2024-01-15', '14:30', 'Note 5');

    await archiveEntry(entry1.id);
    await archiveEntry(entry2.id);

    const count = await countArchivedEntries();
    expect(count).toBe(2);
  });

  it('counts archived entries: with zero entries returns 0', async () => {
    const count = await countArchivedEntries();
    expect(count).toBe(0);
  });

  it('counts archived entries: after restoring one of 2 archived returns 1', async () => {
    const entry1 = await createEntry('2024-01-15', '10:30', 'Note 1');
    const entry2 = await createEntry('2024-01-15', '11:30', 'Note 2');

    await archiveEntry(entry1.id);
    await archiveEntry(entry2.id);

    let count = await countArchivedEntries();
    expect(count).toBe(2);

    await restoreEntry(entry1.id);

    count = await countArchivedEntries();
    expect(count).toBe(1);
  });
});
