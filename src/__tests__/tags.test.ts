import { describe, it, expect } from 'vitest';
import { splitParts, splitSections, extractTags, isTagOnlySection, getEntryLevelTags } from '../lib/tags';

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
});
