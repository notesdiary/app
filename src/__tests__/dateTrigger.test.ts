import { describe, it, expect } from 'vitest';
import { detectDateTrigger } from '../lib/dateTrigger';

describe('detectDateTrigger', () => {
  it('detects @1 at start with caret at position 2', () => {
    const result = detectDateTrigger('@1', 2);
    expect(result).toEqual({ start: 0 });
  });

  it('detects @2 after whitespace in "note @2" with caret at position 7', () => {
    const result = detectDateTrigger('note @2', 7);
    expect(result).toEqual({ start: 5 });
  });

  it('detects @20 after whitespace in "note @20" with caret at position 8', () => {
    const result = detectDateTrigger('note @20', 8);
    expect(result).toEqual({ start: 5 });
  });

  it('returns null for "email@2" at position 7 (no whitespace before @)', () => {
    const result = detectDateTrigger('email@2', 7);
    expect(result).toBeNull();
  });

  it('returns null for "note @j" (no digits after @)', () => {
    const result = detectDateTrigger('note @j', 7);
    expect(result).toBeNull();
  });

  it('returns null for "note @2 more" with caret at position 12 (space after @2)', () => {
    const result = detectDateTrigger('note @2 more', 12);
    expect(result).toBeNull();
  });

  it('returns null for "bare @" with caret at position 6 (no digits)', () => {
    const result = detectDateTrigger('bare @', 6);
    expect(result).toBeNull();
  });

  it('returns null for empty string with caret at position 0', () => {
    const result = detectDateTrigger('', 0);
    expect(result).toBeNull();
  });

  it('detects multiple digits like @123', () => {
    const result = detectDateTrigger('@123', 4);
    expect(result).toEqual({ start: 0 });
  });

  it('detects @7 after multiple spaces in "text  @7" with caret at end', () => {
    const result = detectDateTrigger('text  @7', 8);
    expect(result).toEqual({ start: 6 });
  });

  it('returns null when @ is present but not followed by digits at caret position', () => {
    const result = detectDateTrigger('test @', 6);
    expect(result).toBeNull();
  });

  it('correctly identifies @0 as a valid trigger', () => {
    const result = detectDateTrigger('@0', 2);
    expect(result).toEqual({ start: 0 });
  });
});
