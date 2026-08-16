import { describe, it, expect } from 'vitest';
import { getTodayISO, formatDate, formatDateWithYear, formatTime } from '../lib/dateUtils';

describe('dateUtils', () => {
  describe('getTodayISO', () => {
    it('returns a valid ISO date string', () => {
      const today = getTodayISO();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns today\'s date', () => {
      const today = getTodayISO();
      const actualDate = new Date();
      const expectedDate = new Date(actualDate.getFullYear(), actualDate.getMonth(), actualDate.getDate());
      const expectedISO = expectedDate.toISOString().split('T')[0];
      expect(today).toBe(expectedISO);
    });
  });

  describe('formatDate', () => {
    it('formats a date correctly', () => {
      const result = formatDate('2024-07-28');
      expect(result.weekday).toMatch(/^[A-Za-z]{3}$/);
      expect(result.md).toMatch(/^[A-Za-z]+ \d{1,2}$/);
    });

    it('formats July 28 correctly', () => {
      const result = formatDate('2024-07-28');
      expect(result.md).toBe('Jul 28');
    });

    it('formats a known Monday correctly', () => {
      // 2024-01-01 was a Monday
      const result = formatDate('2024-01-01');
      expect(result.weekday).toBe('Mon');
      expect(result.md).toBe('Jan 1');
    });
  });

  describe('formatDateWithYear', () => {
    it('formats 2026-01-05 correctly', () => {
      expect(formatDateWithYear('2026-01-05')).toBe('Jan 5, 2026');
    });

    it('formats 2024-12-31 correctly', () => {
      expect(formatDateWithYear('2024-12-31')).toBe('Dec 31, 2024');
    });

    it('formats 2024-07-01 correctly', () => {
      expect(formatDateWithYear('2024-07-01')).toBe('Jul 1, 2024');
    });
  });

  describe('formatTime', () => {
    it('formats midnight correctly', () => {
      expect(formatTime('00:05')).toBe('12:05 AM');
      expect(formatTime('00:00')).toBe('12:00 AM');
    });

    it('formats morning hours correctly', () => {
      expect(formatTime('09:00')).toBe('9:00 AM');
      expect(formatTime('09:05')).toBe('9:05 AM');
      expect(formatTime('11:30')).toBe('11:30 AM');
    });

    it('formats noon correctly', () => {
      expect(formatTime('12:00')).toBe('12:00 PM');
      expect(formatTime('12:05')).toBe('12:05 PM');
      expect(formatTime('12:59')).toBe('12:59 PM');
    });

    it('formats afternoon hours correctly', () => {
      expect(formatTime('13:00')).toBe('1:00 PM');
      expect(formatTime('13:05')).toBe('1:05 PM');
      expect(formatTime('17:30')).toBe('5:30 PM');
      expect(formatTime('23:59')).toBe('11:59 PM');
    });

    it('does not have leading zero on single-digit hour', () => {
      expect(formatTime('09:00')).not.toMatch(/^0/);
      expect(formatTime('09:00')).toBe('9:00 AM');
    });

    it('has leading zero on minutes', () => {
      expect(formatTime('09:05')).toBe('9:05 AM');
      expect(formatTime('14:00')).toBe('2:00 PM');
    });
  });
});
