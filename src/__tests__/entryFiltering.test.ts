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
    it('returns all entries in all mode sorted date-desc/time-desc', () => {
      const result = filterEntries(mockEntries, 'all', [], '');
      expect(result).toHaveLength(4);
      // Check sorting: dates should be in descending order
      expect(result[0].date).toBe('2024-01-16');
      expect(result[1].date).toBe('2024-01-16');
      expect(result[2].date).toBe('2024-01-15');
      expect(result[3].date).toBe('2024-01-15');
      // Within same date, time should be descending
      expect(result[0].time).toBe('14:00');
      expect(result[1].time).toBe('09:00');
      expect(result[2].time).toBe('11:00');
      expect(result[3].time).toBe('10:00');
    });

    it('filters by tag in tag mode', () => {
      const result = filterEntries(mockEntries, 'tag', ['#work'], '');
      expect(result).toHaveLength(2);
      expect(result.some(e => e.id === '1')).toBe(true);
      expect(result.some(e => e.id === '3')).toBe(true);
    });

    it('handles multiple tags with OR logic', () => {
      const result = filterEntries(mockEntries, 'tag', ['#work', '#personal'], '');
      expect(result).toHaveLength(3);
    });

    it('handles untagged filter', () => {
      const result = filterEntries(mockEntries, 'tag', ['__untagged__'], '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('filters by search query in search mode', () => {
      const result = filterEntries(mockEntries, 'search', [], 'meeting');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('search is case-insensitive', () => {
      const result = filterEntries(mockEntries, 'search', [], 'HELLO');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('sorts by date descending', () => {
      const filtered = filterEntries(mockEntries, 'all', [], '');
      expect(filtered[0].date >= filtered[1].date).toBe(true);
    });

    it('sorts by time descending within same date', () => {
      const result = filterEntries(mockEntries, 'all', [], '');
      // Filter to same date for this test
      const sameDate = result.filter(e => e.date === '2024-01-15');
      expect(sameDate[0].time > sameDate[1].time).toBe(true);
    });
  });

  describe('filterParagraphsInEntry', () => {
    const entry: Entry = {
      id: '1',
      date: '2024-01-15',
      time: '10:00',
      text: 'First #work\n\nSecond #personal\n\nThird',
      archived: false,
      createdAt: 0,
    };

    it('returns all paragraphs in all mode', () => {
      const result = filterParagraphsInEntry(entry, 'all', [], '');
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
