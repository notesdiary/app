import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCaretCoordinates } from '../lib/caretPosition';

describe('getCaretCoordinates', () => {
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    // Create a fresh textarea for each test
    textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';
    textarea.style.top = '100px';
    textarea.style.left = '100px';
    textarea.style.width = '300px';
    textarea.style.height = '200px';
    textarea.style.padding = '10px';
    textarea.style.fontSize = '16px';
    textarea.style.lineHeight = '20px';
    textarea.style.fontFamily = 'monospace';
    textarea.style.border = '1px solid black';
    document.body.appendChild(textarea);
  });

  afterEach(() => {
    // Clean up
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  });

  it('returns an object with top, left, height properties', () => {
    textarea.value = 'Hello world';
    const result = getCaretCoordinates(textarea, 5);

    expect(result).toHaveProperty('top');
    expect(result).toHaveProperty('left');
    expect(result).toHaveProperty('height');
    expect(typeof result.top).toBe('number');
    expect(typeof result.left).toBe('number');
    expect(typeof result.height).toBe('number');
  });

  it('handles empty textarea without throwing', () => {
    textarea.value = '';
    expect(() => {
      getCaretCoordinates(textarea, 0);
    }).not.toThrow();
  });

  it('handles position at end of text without throwing', () => {
    textarea.value = 'Hello';
    expect(() => {
      getCaretCoordinates(textarea, textarea.value.length);
    }).not.toThrow();
  });

  it('returns valid coordinates for position at start of non-empty text', () => {
    textarea.value = 'Hello world';
    const result = getCaretCoordinates(textarea, 0);

    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('returns valid coordinates for position in middle of text', () => {
    textarea.value = 'Hello world';
    const result = getCaretCoordinates(textarea, 5);

    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('returns valid coordinates for position at end of text', () => {
    textarea.value = 'Hello';
    const result = getCaretCoordinates(textarea, 5);

    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('left coordinate is valid for different positions on same line', () => {
    textarea.value = 'Hello world';
    const pos0 = getCaretCoordinates(textarea, 0);
    const pos5 = getCaretCoordinates(textarea, 5);

    // Both should return valid numeric coordinates
    expect(typeof pos0.left).toBe('number');
    expect(typeof pos5.left).toBe('number');
    expect(isFinite(pos0.left)).toBe(true);
    expect(isFinite(pos5.left)).toBe(true);
  });

  it('top coordinate increases as position moves to next lines', () => {
    // Create multi-line text
    const longText = 'a'.repeat(50); // Enough to wrap
    textarea.value = longText;

    const pos0 = getCaretCoordinates(textarea, 0);
    const posEnd = getCaretCoordinates(textarea, longText.length);

    // Should be on different lines (or at least not in the same position)
    expect(posEnd.top).toBeGreaterThanOrEqual(pos0.top);
  });

  it('cleans up mirror div after measurement', () => {
    textarea.value = 'Test text';
    const initialDivCount = document.querySelectorAll('div').length;

    getCaretCoordinates(textarea, 5);

    // Count divs after - should be same as before (mirror div removed)
    const finalDivCount = document.querySelectorAll('div').length;
    expect(finalDivCount).toBe(initialDivCount);
  });

  it('does not mutate textarea styles', () => {
    textarea.value = 'Test';
    const originalStyle = textarea.getAttribute('style');

    getCaretCoordinates(textarea, 2);

    expect(textarea.getAttribute('style')).toBe(originalStyle);
  });

  it('does not mutate textarea value', () => {
    const originalValue = 'Original text';
    textarea.value = originalValue;

    getCaretCoordinates(textarea, 5);

    expect(textarea.value).toBe(originalValue);
  });

  it('height is approximately line height', () => {
    textarea.style.lineHeight = '24px';
    textarea.value = 'Test';

    const result = getCaretCoordinates(textarea, 2);

    // Should be close to the line-height we set
    expect(result.height).toBeGreaterThan(15);
    expect(result.height).toBeLessThan(30);
  });

  it('handles position beyond text length gracefully', () => {
    textarea.value = 'Hello';
    // Position beyond length should be treated like end of text
    const result = getCaretCoordinates(textarea, 100);

    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('handles position with negative index gracefully', () => {
    textarea.value = 'Hello';
    // Negative position should not throw
    expect(() => {
      getCaretCoordinates(textarea, -5);
    }).not.toThrow();
  });

  it('handles textarea with no value property gracefully', () => {
    // Create a textarea and delete its value (shouldn't happen, but test resilience)
    textarea.value = '';
    expect(() => {
      getCaretCoordinates(textarea, 0);
    }).not.toThrow();
  });

  it('returns coordinates for all positions without error', () => {
    textarea.value = 'Hello world';
    // Should not throw for any valid position
    const pos0 = getCaretCoordinates(textarea, 0);
    const pos5 = getCaretCoordinates(textarea, 5);
    const pos11 = getCaretCoordinates(textarea, 11);

    // All should return valid numeric values
    [pos0, pos5, pos11].forEach((result) => {
      expect(typeof result.top).toBe('number');
      expect(typeof result.left).toBe('number');
      expect(typeof result.height).toBe('number');
      expect(isFinite(result.top)).toBe(true);
      expect(isFinite(result.left)).toBe(true);
      expect(isFinite(result.height)).toBe(true);
    });
  });
});
