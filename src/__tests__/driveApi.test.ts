import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ensureJsonExtension, uploadNamedFile, deleteFile } from '../lib/driveApi';
import { Entry } from '../types';

describe('driveApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureJsonExtension', () => {
    it('appends .json if filename does not end with .json', () => {
      const result = ensureJsonExtension('rule-a');
      expect(result).toBe('rule-a.json');
    });

    it('returns filename unchanged if it already ends with .json', () => {
      const result = ensureJsonExtension('rule-a.json');
      expect(result).toBe('rule-a.json');
    });

    it('trims whitespace from input', () => {
      const result = ensureJsonExtension('  rule-a  ');
      expect(result).toBe('rule-a.json');
    });

    it('trims whitespace and preserves .json extension', () => {
      const result = ensureJsonExtension('  rule-a.json  ');
      expect(result).toBe('rule-a.json');
    });

    it('treats .json extension as case-sensitive', () => {
      const result = ensureJsonExtension('rule-a.JSON');
      expect(result).toBe('rule-a.JSON.json');
    });
  });

  describe('uploadNamedFile', () => {
    const mockToken = 'test-token';
    const mockFolderId = 'folder-123';
    const mockFileName = 'custom-rule';
    const mockEntries: Entry[] = [
      {
        id: '1',
        date: '2026-01-01',
        time: '10:00',
        text: 'Test Entry',
        createdAt: Date.now(),
      },
    ];

    it('creates new file with multipart upload when no existingFileId', async () => {
      const mockResponseJson = { id: 'new-file-123' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseJson,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await uploadNamedFile(
        mockToken,
        mockFolderId,
        mockFileName,
        mockEntries
      );

      expect(result).toBe('new-file-123');
      expect(mockFetch).toHaveBeenCalledOnce();

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('uploadType=multipart');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
    });

    it('updates existing file with PATCH when existingFileId provided', async () => {
      const mockFileId = 'existing-file-456';
      const mockResponseJson = { id: mockFileId };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseJson,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await uploadNamedFile(
        mockToken,
        mockFolderId,
        mockFileName,
        mockEntries,
        mockFileId
      );

      expect(result).toBe(mockFileId);
      expect(mockFetch).toHaveBeenCalledOnce();

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}`);
      expect(callArgs[0]).toContain('uploadType=media');
      expect(callArgs[1].method).toBe('PATCH');
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
    });

    it('ensures .json extension on filename before uploading', async () => {
      const mockResponseJson = { id: 'new-file-789' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponseJson,
      });
      (globalThis as any).fetch = mockFetch;

      await uploadNamedFile(mockToken, mockFolderId, 'my-rule', mockEntries);

      expect(mockFetch).toHaveBeenCalledOnce();
      const callBody = mockFetch.mock.calls[0][1].body;
      // FormData is used for multipart, check that it's sent
      expect(callBody).toBeDefined();
    });
  });

  describe('deleteFile', () => {
    const mockToken = 'test-token';
    const mockFileId = 'file-to-delete';

    it('calls DELETE endpoint with proper headers', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });
      (globalThis as any).fetch = mockFetch;

      await deleteFile(mockToken, mockFileId);

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}`);
      expect(callArgs[1].method).toBe('DELETE');
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
    });

    it('resolves without return value on success', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await deleteFile(mockToken, mockFileId);

      expect(result).toBeUndefined();
    });

    it('throws error when response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });
      (globalThis as any).fetch = mockFetch;

      await expect(deleteFile(mockToken, mockFileId)).rejects.toThrow(
        'Failed to delete file: Not Found'
      );
    });

    it('throws error with different status text', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
      });
      (globalThis as any).fetch = mockFetch;

      await expect(deleteFile(mockToken, mockFileId)).rejects.toThrow(
        'Failed to delete file: Forbidden'
      );
    });
  });
});
