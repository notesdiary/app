import { describe, it, expect } from 'vitest';
import {
  splitParts,
  splitSections,
  extractTags,
  isTagOnlySection,
  getEntryLevelTags,
  isValidCalendarDate,
  findAcceptedDateToken,
  parseSectionDate,
  splitPartsWithDate,
  AlreadyEmitted,
} from '../lib/tags';

describe('tags', () => {
  describe('splitParts', () => {
    it('splits text with one tag', () => {
      const result = splitParts('hi #foo bar');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: 'hi ', isTag: false });
      expect(result[1]).toEqual({ text: '#foo', isTag: true });
      expect(result[2]).toEqual({ text: ' bar', isTag: false });
    });

    it('does not match tag starting with digit', () => {
      const result = splitParts('#3d is not a tag');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: '#3d is not a tag', isTag: false });
    });

    it('matches tag with hyphens and underscores', () => {
      const result = splitParts('#a-b_c');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: '#a-b_c', isTag: true });
    });

    it('handles multiple tags', () => {
      const result = splitParts('hello #tag1 world #tag2');
      expect(result).toHaveLength(4);
      expect(result.filter(p => p.isTag)).toHaveLength(2);
      expect(result.filter(p => !p.isTag)).toHaveLength(2);
    });

    it('handles tag at start of text', () => {
      const result = splitParts('#start of text');
      expect(result[0]).toEqual({ text: '#start', isTag: true });
    });

    it('handles tag at end of text', () => {
      const result = splitParts('end of #text');
      const lastPart = result[result.length - 1];
      expect(lastPart).toEqual({ text: '#text', isTag: true });
    });

    it('handles consecutive tags', () => {
      const result = splitParts('#tag1#tag2');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: '#tag1', isTag: true });
      expect(result[1]).toEqual({ text: '#tag2', isTag: true });
    });

    it('returns single non-tag part for text with no tags', () => {
      const result = splitParts('plain text');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: 'plain text', isTag: false });
    });
  });

  describe('splitSections', () => {
    it('single line, no breaks', () => {
      const result = splitSections('single line');
      expect(result).toEqual(['single line']);
    });

    it('two lines with single newline stay one section with break preserved', () => {
      const result = splitSections('line1\nline2');
      expect(result).toEqual(['line1\nline2']);
    });

    it('blank-line-separated paragraphs become separate sections', () => {
      const result = splitSections('para1\n\npara2');
      expect(result).toEqual(['para1', 'para2']);
    });

    it('multiple blank lines collapse to single boundary', () => {
      const result = splitSections('para1\n\n\n\npara2');
      expect(result).toEqual(['para1', 'para2']);
    });

    it('leading and trailing blank lines are trimmed', () => {
      const result = splitSections('\n\npara1\n\n');
      expect(result).toEqual(['para1']);
    });

    it('section with internal line breaks plus blank-line-separated section', () => {
      const result = splitSections('line1\nline2\n\npara2');
      expect(result).toEqual(['line1\nline2', 'para2']);
    });

    it('all-whitespace and empty input return empty array', () => {
      expect(splitSections('')).toEqual([]);
      expect(splitSections('   \n\n   ')).toEqual([]);
    });

    it('three-section entry mixing single breaks and paragraph breaks', () => {
      const result = splitSections('a\nb\n\nc\n\n\nd\ne\nf');
      expect(result).toEqual(['a\nb', 'c', 'd\ne\nf']);
    });
  });

  describe('extractTags', () => {
    it('extracts tags from text', () => {
      const result = extractTags('hello #foo #bar world');
      expect(result).toEqual(['#foo', '#bar']);
    });

    it('returns empty array for text with no tags', () => {
      const result = extractTags('plain text');
      expect(result).toEqual([]);
    });

    it('handles multiple occurrences of same tag', () => {
      const result = extractTags('#tag #tag');
      expect(result).toEqual(['#tag', '#tag']);
    });
  });

  describe('isTagOnlySection', () => {
    it('returns true for tags only', () => {
      const result = isTagOnlySection('#work #urgent');
      expect(result).toBe(true);
    });

    it('returns false for tags mixed with prose', () => {
      const result = isTagOnlySection('#work urgent stuff');
      expect(result).toBe(false);
    });

    it('returns false for tags separated by punctuation', () => {
      const result = isTagOnlySection('#work, #urgent');
      expect(result).toBe(false);
    });

    it('returns true for empty string', () => {
      const result = isTagOnlySection('');
      expect(result).toBe(true);
    });

    it('returns true for whitespace only', () => {
      const result = isTagOnlySection('   ');
      expect(result).toBe(true);
    });

    it('returns true for tags separated by newlines', () => {
      const result = isTagOnlySection('#work\n#urgent');
      expect(result).toBe(true);
    });
  });

  describe('getEntryLevelTags', () => {
    it('returns tags from trailing tag-only section', () => {
      const result = getEntryLevelTags('line one\n\n#work #urgent');
      expect(result).toEqual(['#work', '#urgent']);
    });

    it('returns empty array when tag-only section is not last', () => {
      const result = getEntryLevelTags('#work #urgent\n\nline one');
      expect(result).toEqual([]);
    });

    it('returns tags from single-section entry', () => {
      const result = getEntryLevelTags('#work #urgent');
      expect(result).toEqual(['#work', '#urgent']);
    });

    it('returns empty array for entry with no tags', () => {
      const result = getEntryLevelTags('just prose, no tags');
      expect(result).toEqual([]);
    });

    it('returns empty array for empty input', () => {
      const result = getEntryLevelTags('');
      expect(result).toEqual([]);
    });

    it('returns empty array when last section has mixed tag and text', () => {
      const result = getEntryLevelTags('line\n\n#work and more text');
      expect(result).toEqual([]);
    });

    it('handles multiple tags with various spacing', () => {
      const result = getEntryLevelTags('content\n\n#a #b  #c   #d');
      expect(result).toEqual(['#a', '#b', '#c', '#d']);
    });
  });

  describe('isValidCalendarDate', () => {
    it('returns true for valid leap year date', () => {
      expect(isValidCalendarDate(2026, 2, 28)).toBe(true);
    });

    it('returns false for Feb 29 in non-leap year', () => {
      expect(isValidCalendarDate(2026, 2, 29)).toBe(false);
    });

    it('returns true for Feb 29 in leap year', () => {
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
    });

    it('returns false for Feb 30', () => {
      expect(isValidCalendarDate(2026, 2, 30)).toBe(false);
    });

    it('returns false for month 13', () => {
      expect(isValidCalendarDate(2026, 13, 5)).toBe(false);
    });

    it('returns false for month 0', () => {
      expect(isValidCalendarDate(2026, 0, 5)).toBe(false);
    });

    it('returns false for day 0', () => {
      expect(isValidCalendarDate(2026, 1, 0)).toBe(false);
    });

    it('returns false for day 32 in 31-day month', () => {
      expect(isValidCalendarDate(2026, 1, 32)).toBe(false);
    });

    it('returns false for day 31 in 30-day month', () => {
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false);
    });

    it('returns true for Jan 1', () => {
      expect(isValidCalendarDate(2026, 1, 1)).toBe(true);
    });

    it('returns true for Dec 31', () => {
      expect(isValidCalendarDate(2026, 12, 31)).toBe(true);
    });
  });

  describe('findAcceptedDateToken', () => {
    it('finds valid date in middle of text', () => {
      const result = findAcceptedDateToken('meeting @2026-01-05 notes');
      expect(result).toEqual({
        index: 8,
        raw: '@2026-01-05',
        iso: '2026-01-05',
      });
    });

    it('finds date at start of text', () => {
      const result = findAcceptedDateToken('@2026-01-05');
      expect(result).toEqual({
        index: 0,
        raw: '@2026-01-05',
        iso: '2026-01-05',
      });
    });

    it('returns null when no date present', () => {
      const result = findAcceptedDateToken('no date here');
      expect(result).toBeNull();
    });

    it('returns null for invalid month', () => {
      const result = findAcceptedDateToken('@2026-13-45');
      expect(result).toBeNull();
    });

    it('returns null for invalid day', () => {
      const result = findAcceptedDateToken('@2026-02-30');
      expect(result).toBeNull();
    });

    it('returns first valid date when multiple present', () => {
      const result = findAcceptedDateToken('@2026-01-05 and @2026-02-10');
      expect(result).toEqual({
        index: 0,
        raw: '@2026-01-05',
        iso: '2026-01-05',
      });
    });

    it('skips invalid dates and returns first valid', () => {
      const result = findAcceptedDateToken('@2026-13-45 then @2026-01-05');
      expect(result).toEqual({
        index: 17,
        raw: '@2026-01-05',
        iso: '2026-01-05',
      });
    });

    it('requires whitespace or start before @ (rejects foo@2026-01-05)', () => {
      const result = findAcceptedDateToken('foo@2026-01-05');
      expect(result).toBeNull();
    });

    it('rejects date followed by digit (@2026-01-051)', () => {
      const result = findAcceptedDateToken('@2026-01-051');
      expect(result).toBeNull();
    });

    it('rejects wrong format (@2026-1-5)', () => {
      const result = findAcceptedDateToken('@2026-1-5');
      expect(result).toBeNull();
    });

    it('accepts date at end of text', () => {
      const result = findAcceptedDateToken('meeting on @2026-01-05');
      expect(result).toEqual({
        index: 11,
        raw: '@2026-01-05',
        iso: '2026-01-05',
      });
    });
  });

  describe('parseSectionDate', () => {
    it('returns ISO date for text with valid date', () => {
      const result = parseSectionDate('meeting @2026-01-05 notes');
      expect(result).toBe('2026-01-05');
    });

    it('returns ISO date for bare date', () => {
      const result = parseSectionDate('@2026-01-05');
      expect(result).toBe('2026-01-05');
    });

    it('returns null for text without date', () => {
      const result = parseSectionDate('no date');
      expect(result).toBeNull();
    });

    it('returns null for invalid calendar date', () => {
      const result = parseSectionDate('@2026-13-45');
      expect(result).toBeNull();
    });

    it('returns null for Feb 30', () => {
      const result = parseSectionDate('@2026-02-30');
      expect(result).toBeNull();
    });

    it('returns first valid date when multiple present', () => {
      const result = parseSectionDate('@2026-01-05 and @2026-02-10');
      expect(result).toBe('2026-01-05');
    });

    it('skips invalid and returns first valid date', () => {
      const result = parseSectionDate('@2026-13-45 then @2026-01-05');
      expect(result).toBe('2026-01-05');
    });

    it('returns null for date missing boundary (foo@2026-01-05)', () => {
      const result = parseSectionDate('foo@2026-01-05');
      expect(result).toBeNull();
    });

    it('returns null for date with trailing digit (@2026-01-051)', () => {
      const result = parseSectionDate('@2026-01-051');
      expect(result).toBeNull();
    });

    it('returns null for wrong format (@2026-1-5)', () => {
      const result = parseSectionDate('@2026-1-5');
      expect(result).toBeNull();
    });
  });

  describe('splitPartsWithDate', () => {
    it('marks matching date with isDate:true and date field', () => {
      const result = splitPartsWithDate('note @2026-01-05 done', '2026-01-05');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: 'note ', isTag: false });
      expect(result[1]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(result[2]).toEqual({ text: ' done', isTag: false });
    });

    it('treats date as plain text when acceptedIso is null', () => {
      const result = splitPartsWithDate('@2026-01-05', null);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: '@2026-01-05', isTag: false });
    });

    it('ignores non-matching date tokens', () => {
      const result = splitPartsWithDate('@2026-02-10', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: '@2026-02-10', isTag: false });
    });

    it('marks first matching date when multiple different dates present', () => {
      const result = splitPartsWithDate('@2026-01-05 and @2026-02-10', '2026-01-05');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(result[1]).toEqual({ text: ' and ', isTag: false });
      expect(result[2]).toEqual({ text: '@2026-02-10', isTag: false });
    });

    it('marks first matching date when same date appears multiple times', () => {
      const result = splitPartsWithDate('@2026-01-05 and @2026-01-05', '2026-01-05');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(result[1]).toEqual({ text: ' and ', isTag: false });
      expect(result[2]).toEqual({ text: '@2026-01-05', isTag: false });
      expect(result[2].isDate).toBeUndefined();
      expect(result[2].date).toBeUndefined();
    });

    it('shares emitted flag across multiple calls', () => {
      const state: AlreadyEmitted = { done: false };
      const result1 = splitPartsWithDate('@2026-01-05 text', '2026-01-05', state);
      expect(result1[0]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(state.done).toBe(true);

      // Now call again with same state
      const result2 = splitPartsWithDate('@2026-01-05 more', '2026-01-05', state);
      expect(result2[0]).toEqual({ text: '@2026-01-05', isTag: false });
      expect(result2[0].isDate).toBeUndefined();
      expect(result2[0].date).toBeUndefined();
    });

    it('maintains splitParts behavior - tags unchanged', () => {
      const result = splitParts('hi #foo bar');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: 'hi ', isTag: false });
      expect(result[1]).toEqual({ text: '#foo', isTag: true });
      expect(result[2]).toEqual({ text: ' bar', isTag: false });
    });

    it('handles date and tags together', () => {
      const result = splitPartsWithDate('note @2026-01-05 #work done', '2026-01-05');
      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ text: 'note ', isTag: false });
      expect(result[1]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(result[2]).toEqual({ text: ' ', isTag: false });
      expect(result[3]).toEqual({ text: '#work', isTag: true });
      expect(result[4]).toEqual({ text: ' done', isTag: false });
    });

    it('handles tags before and after marked date', () => {
      const result = splitPartsWithDate('#start @2026-01-05 #end', '2026-01-05');
      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ text: '#start', isTag: true });
      expect(result[1]).toEqual({ text: ' ', isTag: false });
      expect(result[2]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(result[3]).toEqual({ text: ' ', isTag: false });
      expect(result[4]).toEqual({ text: '#end', isTag: true });
    });

    it('rejects invalid date tokens and only marks valid matching dates', () => {
      const result = splitPartsWithDate('@2026-13-45 real @2026-01-05', '2026-01-05');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: '@2026-13-45 real ', isTag: false });
      expect(result[1]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
    });

    it('date at start of text', () => {
      const result = splitPartsWithDate('@2026-01-05 start', '2026-01-05');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
      expect(result[1]).toEqual({ text: ' start', isTag: false });
    });

    it('date at end of text', () => {
      const result = splitPartsWithDate('end @2026-01-05', '2026-01-05');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'end ', isTag: false });
      expect(result[1]).toEqual({ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' });
    });

    it('handles only tags, no dates', () => {
      const result = splitPartsWithDate('#tag1 #tag2', '2026-01-05');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: '#tag1', isTag: true });
      expect(result[1]).toEqual({ text: ' ', isTag: false });
      expect(result[2]).toEqual({ text: '#tag2', isTag: true });
    });

    it('handles plain text with no dates or tags', () => {
      const result = splitPartsWithDate('plain text', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: 'plain text', isTag: false });
    });

    it('date at start requires whitespace or string start', () => {
      // foo@2026-01-05 should not match due to missing word boundary
      const result = splitPartsWithDate('foo@2026-01-05', '2026-01-05');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: 'foo@2026-01-05', isTag: false });
    });

    it('does not mark date from a different iso value in text', () => {
      const result = splitPartsWithDate('has @2026-02-10', '2026-01-05');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'has ', isTag: false });
      expect(result[1]).toEqual({ text: '@2026-02-10', isTag: false });
      expect(result[1].isDate).toBeUndefined();
      expect(result[1].date).toBeUndefined();
    });
  });
});
