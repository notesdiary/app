import { describe, it, expect } from 'vitest';
import { deriveMode } from '../lib/mode';

describe('mode', () => {
  describe('deriveMode', () => {
    it('returns day mode when no filters are active', () => {
      const result = deriveMode('', []);
      expect(result).toBe('day');
    });

    it('returns tag mode when tags are selected but no search', () => {
      const result = deriveMode('', ['#tag1']);
      expect(result).toBe('tag');
    });

    it('returns tag mode with multiple tags', () => {
      const result = deriveMode('', ['#tag1', '#tag2']);
      expect(result).toBe('tag');
    });

    it('returns search mode when search query is present', () => {
      const result = deriveMode('query', []);
      expect(result).toBe('search');
    });

    it('search mode takes precedence over tag mode', () => {
      const result = deriveMode('query', ['#tag1']);
      expect(result).toBe('search');
    });

    it('ignores whitespace-only search query', () => {
      const result = deriveMode('   ', ['#tag1']);
      expect(result).toBe('tag');
    });

    it('ignores whitespace-only search query for day mode', () => {
      const result = deriveMode('   ', []);
      expect(result).toBe('day');
    });
  });
});
