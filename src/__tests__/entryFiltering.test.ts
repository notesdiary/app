import { describe, it, expect } from 'vitest';
import { filterEntries, filterParagraphsInEntry } from '../lib/entryFiltering';
import { Entry } from '../types';

describe('entryFiltering', () => {
  const mockEntries: Entry[] = [
    {
      id: '1',
      date: '2024-01-15',
      time: '10:00',
      text: 'Hello #work',
      archived: false,
      createdAt: 0,
    },
    {
      id: '2',
      date: '2024-01-15',
      time: '11:00',
      text: 'Personal note #personal',
      archived: false,
      createdAt: 0,
    },
    {
      id: '3',
      date: '2024-01-16',
      time: '09:00',
      text: 'Work meeting #work #meeting',
      archived: false,
      createdAt: 0,
    },
    {
      id: '4',
      date: '2024-01-16',
      time: '14:00',
      text: 'No tags here',
      archived: false,
      createdAt: 0,
    },
  ];

  describe('filterEntries', () => {
    it('filters by date in day mode', () => {
      const result = filterEntries(mockEntries, 'day', '2024-01-15', [], '');
      expect(result).toHaveLength(2);
      expect(result.every(e => e.date === '2024-01-15')).toBe(true);
    });

    it('filters by tag in tag mode', () => {
      const result = filterEntries(mockEntries, 'tag', '2024-01-15', ['#work'], '');
      expect(result).toHaveLength(2);
      expect(result.some(e => e.id === '1')).toBe(true);
      expect(result.some(e => e.id === '3')).toBe(true);
    });

    it('handles multiple tags with OR logic', () => {
      const result = filterEntries(mockEntries, 'tag', '2024-01-15', ['#work', '#personal'], '');
      expect(result).toHaveLength(3);
    });

    it('handles untagged filter', () => {
      const result = filterEntries(mockEntries, 'tag', '2024-01-15', ['__untagged__'], '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('filters by search query in search mode', () => {
      const result = filterEntries(mockEntries, 'search', '2024-01-15', [], 'meeting');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('search is case-insensitive', () => {
      const result = filterEntries(mockEntries, 'search', '2024-01-15', [], 'HELLO');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('sorts by date descending', () => {
      const result = filterEntries(mockEntries, 'day', '2024-01-15', [], '');
      const filtered = filterEntries(mockEntries, 'search', '', [], '');
      expect(filtered[0].date >= filtered[1].date).toBe(true);
    });

    it('sorts by time descending within same date', () => {
      const result = filterEntries(mockEntries, 'day', '2024-01-15', [], '');
      expect(result[0].time > result[1].time).toBe(true);
    });
  });

  describe('filterParagraphsInEntry', () => {
    const entry: Entry = {
      id: '1',
      date: '2024-01-15',
      time: '10:00',
      text: 'First #work\nSecond #personal\nThird',
      archived: false,
      createdAt: 0,
    };

    it('returns all paragraphs in day mode', () => {
      const result = filterParagraphsInEntry(entry, 'day', [], '');
      expect(result).toHaveLength(3);
    });

    it('filters paragraphs by tag in tag mode', () => {
      const result = filterParagraphsInEntry(entry, 'tag', ['#work'], '');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('First #work');
    });

    it('handles untagged in tag mode', () => {
      const result = filterParagraphsInEntry(entry, 'tag', ['__untagged__'], '');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Third');
    });

    it('filters paragraphs by search query in search mode', () => {
      const result = filterParagraphsInEntry(entry, 'search', [], 'personal');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Second #personal');
    });
  });
});
