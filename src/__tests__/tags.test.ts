import { describe, it, expect } from 'vitest';
import { splitParts, splitParagraphs, extractTags } from '../lib/tags';

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

  describe('splitParagraphs', () => {
    it('splits on newline', () => {
      const result = splitParagraphs('line1\nline2\nline3');
      expect(result).toEqual(['line1', 'line2', 'line3']);
    });

    it('trims each paragraph', () => {
      const result = splitParagraphs('  line1  \n  line2  ');
      expect(result).toEqual(['line1', 'line2']);
    });

    it('filters empty paragraphs', () => {
      const result = splitParagraphs('line1\n\n\nline2');
      expect(result).toEqual(['line1', 'line2']);
    });

    it('returns single empty string for all-empty input', () => {
      const result = splitParagraphs('');
      expect(result).toEqual(['']);
    });

    it('returns single empty string for whitespace-only input', () => {
      const result = splitParagraphs('   \n\n   ');
      expect(result).toEqual(['']);
    });

    it('handles single line', () => {
      const result = splitParagraphs('single line');
      expect(result).toEqual(['single line']);
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
});
