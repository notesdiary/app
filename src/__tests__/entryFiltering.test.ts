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

    // Test case 1: Entry with trailing tag-only section, filtering by entry-level tag -> returns all sections
    it('returns all sections when filtering by entry-level tag in trailing section', () => {
      const entryWithTrailingTag: Entry = {
        id: '1',
        date: '2024-01-15',
        time: '10:00',
        text: 'note text\n\n#work',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(entryWithTrailingTag, 'tag', ['#work'], '');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('note text');
      expect(result[1]).toBe('#work');
    });

    // Test case 2: Entry where tag appears in earlier section -> filtering by that tag returns only that section
    it('returns only section-level match when tag appears in non-last section', () => {
      const entryWithTagInMiddle: Entry = {
        id: '2',
        date: '2024-01-15',
        time: '10:00',
        text: '#work stuff here\n\nmore text\n\n#personal',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(entryWithTagInMiddle, 'tag', ['#work'], '');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('#work stuff here');
    });

    // Test case 3: Entry with NON-trailing tag-only section -> old per-section behavior preserved
    it('applies section-level filtering when tag-only section is not last', () => {
      const entryWithEarlyTagSection: Entry = {
        id: '3',
        date: '2024-01-15',
        time: '10:00',
        text: '#work\n\nprose section',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(entryWithEarlyTagSection, 'tag', ['#work'], '');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('#work');
    });

    // Test case 4: Entry with two trailing tag-only sections
    it('handles multiple trailing tag-only sections correctly', () => {
      const entryWithTwoTrailingTags: Entry = {
        id: '4',
        date: '2024-01-15',
        time: '10:00',
        text: 'body\n\n#early\n\n#late',
        archived: false,
        createdAt: 0,
      };
      // Filtering by #late (the true last section's tag) returns all sections
      const resultLate = filterParagraphsInEntry(entryWithTwoTrailingTags, 'tag', ['#late'], '');
      expect(resultLate).toHaveLength(3);
      expect(resultLate[0]).toBe('body');
      expect(resultLate[1]).toBe('#early');
      expect(resultLate[2]).toBe('#late');

      // Filtering by #early (earlier tag-only section, not last) returns only that section
      const resultEarly = filterParagraphsInEntry(entryWithTwoTrailingTags, 'tag', ['#early'], '');
      expect(resultEarly).toHaveLength(1);
      expect(resultEarly[0]).toBe('#early');
    });

    // Test case 5: filterEntries regression - entry with entry-level tag still appears in tag-mode entry list
    it('filterEntries includes entry with only entry-level tag when filtering by that tag', () => {
      const entryWithEntryLevelTag: Entry = {
        id: '5',
        date: '2024-01-15',
        time: '10:00',
        text: 'body text\n\n#project',
        archived: false,
        createdAt: 0,
      };
      const result = filterEntries([entryWithEntryLevelTag], 'tag', ['#project'], '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
    });

    // Test case 6: __untagged__ regression - entry-level tags must not swallow the untagged branch
    it('__untagged__ filter still works with entry-level tags present', () => {
      const entryWithEntryLevelTag: Entry = {
        id: '6',
        date: '2024-01-15',
        time: '10:00',
        text: 'body text\n\n#project',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(entryWithEntryLevelTag, 'tag', ['__untagged__'], '');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('body text');
    });

    // Test case 7: Multi-select union - OR semantics preserved through entry-level check
    it('handles multi-select union with entry-level tags', () => {
      const entryWithEntryLevelTag: Entry = {
        id: '7',
        date: '2024-01-15',
        time: '10:00',
        text: 'body\n\n#project',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(entryWithEntryLevelTag, 'tag', ['#other', '#project'], '');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('body');
      expect(result[1]).toBe('#project');
    });

    // Test case 8: Retroactive-behavior test - old entries behave as entry-level after the change
    it('retroactively applies entry-level behavior to pre-existing entries', () => {
      const oldStyleEntry: Entry = {
        id: '8',
        date: '2024-01-15',
        time: '10:00',
        text: 'meeting notes here\n\n#meeting',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(oldStyleEntry, 'tag', ['#meeting'], '');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('meeting notes here');
      expect(result[1]).toBe('#meeting');
    });
  });

  describe('filterEntries with selectedDate (tag mode + date)', () => {
    it('T6: Bug-fix test - date-only filter with empty selectedTags returns entry', () => {
      // This test will FAIL without the selectedTags.length === 0 guard
      const entryWithDate: Entry = {
        id: '1',
        date: '2026-01-05',
        time: '10:00',
        text: 'Some note @2026-01-05',
        archived: false,
        createdAt: 0,
      };
      // selectedTags is empty [], selectedDate is "2026-01-05"
      // Without the guard, selectedTags.some() returns false even though we want date-only filtering
      const result = filterEntries([entryWithDate], 'tag', [], '', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('filters by date when no date-containing sections match', () => {
      const entries: Entry[] = [
        {
          id: '1',
          date: '2026-01-05',
          time: '10:00',
          text: 'Section A @2026-01-05\n\nSection B no date',
          archived: false,
          createdAt: 0,
        },
        {
          id: '2',
          date: '2026-01-06',
          time: '10:00',
          text: 'Other note @2026-01-06',
          archived: false,
          createdAt: 0,
        },
      ];
      // Filter by date "2026-01-05" with no tag filter
      const result = filterEntries(entries, 'tag', [], '', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('AND logic: tag AND date both required', () => {
      const entries: Entry[] = [
        {
          id: '1',
          date: '2026-01-05',
          time: '10:00',
          text: '#work @2026-01-05',
          archived: false,
          createdAt: 0,
        },
        {
          id: '2',
          date: '2026-01-05',
          time: '10:00',
          text: '#work no date',
          archived: false,
          createdAt: 0,
        },
        {
          id: '3',
          date: '2026-01-05',
          time: '10:00',
          text: 'no tag @2026-01-05',
          archived: false,
          createdAt: 0,
        },
      ];
      // Filter by tag "#work" AND date "2026-01-05"
      // Should return only entry 1 (has both tag and date in same section)
      const result = filterEntries(entries, 'tag', ['#work'], '', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('no selectedDate = regression - tag-only filtering unchanged', () => {
      const entries: Entry[] = [
        {
          id: '1',
          date: '2026-01-05',
          time: '10:00',
          text: '#work @2026-01-05',
          archived: false,
          createdAt: 0,
        },
        {
          id: '2',
          date: '2026-01-05',
          time: '10:00',
          text: '#work no date',
          archived: false,
          createdAt: 0,
        },
      ];
      // Filter by tag only (no selectedDate or selectedDate=null)
      // Both should match (old behavior)
      const result = filterEntries(entries, 'tag', ['#work'], '');
      expect(result).toHaveLength(2);
    });

    it('search mode ignores selectedDate - precedence unchanged', () => {
      const entries: Entry[] = [
        {
          id: '1',
          date: '2026-01-05',
          time: '10:00',
          text: 'hello @2026-01-05',
          archived: false,
          createdAt: 0,
        },
        {
          id: '2',
          date: '2026-01-06',
          time: '10:00',
          text: 'hello @2026-01-06',
          archived: false,
          createdAt: 0,
        },
      ];
      // Even with selectedDate, search mode should return both (date filter ignored in search mode)
      const result = filterEntries(entries, 'search', [], 'hello', '2026-01-05');
      expect(result).toHaveLength(2);
    });
  });

  describe('filterParagraphsInEntry with selectedDate (tag mode + date)', () => {
    it('filters sections by date when selectedDate provided', () => {
      const entry: Entry = {
        id: '1',
        date: '2026-01-05',
        time: '10:00',
        text: 'Section A @2026-01-05\n\nSection B @2026-01-06',
        archived: false,
        createdAt: 0,
      };
      // Filter by date "2026-01-05" with no tag filter
      const result = filterParagraphsInEntry(entry, 'tag', [], '', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Section A @2026-01-05');
    });

    it('AND logic in filterParagraphsInEntry: tag AND date both required', () => {
      const entry: Entry = {
        id: '1',
        date: '2026-01-05',
        time: '10:00',
        text: '#work @2026-01-05\n\n#work no date\n\nno tag @2026-01-05',
        archived: false,
        createdAt: 0,
      };
      // Filter by tag "#work" AND date "2026-01-05"
      const result = filterParagraphsInEntry(entry, 'tag', ['#work'], '', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('#work @2026-01-05');
    });

    it('date-only filter in filterParagraphsInEntry', () => {
      const entry: Entry = {
        id: '1',
        date: '2026-01-05',
        time: '10:00',
        text: 'Undated section\n\n@2026-01-05 only date\n\n#tag no date',
        archived: false,
        createdAt: 0,
      };
      const result = filterParagraphsInEntry(entry, 'tag', [], '', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('@2026-01-05 only date');
    });

    it('no selectedDate = regression - tag-only filtering in filterParagraphsInEntry', () => {
      const entry: Entry = {
        id: '1',
        date: '2026-01-05',
        time: '10:00',
        text: '#work @2026-01-05\n\n#work no date\n\nno tag @2026-01-05',
        archived: false,
        createdAt: 0,
      };
      // Filter by tag only (no selectedDate)
      // Both #work sections should match
      const result = filterParagraphsInEntry(entry, 'tag', ['#work'], '');
      expect(result).toHaveLength(2);
    });

    it('search mode ignores selectedDate in filterParagraphsInEntry', () => {
      const entry: Entry = {
        id: '1',
        date: '2026-01-05',
        time: '10:00',
        text: 'hello @2026-01-05\n\nhello @2026-01-06',
        archived: false,
        createdAt: 0,
      };
      // Even with selectedDate, search mode should return both
      const result = filterParagraphsInEntry(entry, 'search', [], 'hello', '2026-01-05');
      expect(result).toHaveLength(2);
    });
  });
});
