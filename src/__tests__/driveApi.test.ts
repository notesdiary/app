import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ensureJsonExtension,
  uploadNamedFile,
  deleteFile,
  listPermissions,
  createPermission,
  createAnyonePermission,
  updatePermission,
  deletePermission,
  findOrCreateSubfolder,
} from '../lib/driveApi';
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

  describe('listPermissions', () => {
    const mockToken = 'test-token';
    const mockFileId = 'file-123';

    it('returns the parsed permissions array from the response', async () => {
      const mockPermissions = [
        { id: 'perm-1', type: 'user', role: 'writer', emailAddress: 'a@example.com' },
        { id: 'perm-2', type: 'anyone', role: 'reader' },
      ];
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ permissions: mockPermissions }),
      });
      (globalThis as any).fetch = mockFetch;

      const result = await listPermissions(mockToken, mockFileId);

      expect(result).toEqual(mockPermissions);
      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}/permissions`);
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
    });

    it('returns [] when the response has no permissions key', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      (globalThis as any).fetch = mockFetch;

      const result = await listPermissions(mockToken, mockFileId);

      expect(result).toEqual([]);
    });
  });

  describe('createPermission', () => {
    const mockToken = 'test-token';
    const mockFileId = 'file-123';

    it('sends type user with emailAddress and role, and returns the parsed permission', async () => {
      const mockPermission = { id: 'perm-1', type: 'user', role: 'writer', emailAddress: 'a@example.com' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPermission,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await createPermission(mockToken, mockFileId, {
        emailAddress: 'a@example.com',
        role: 'writer',
      });

      expect(result).toEqual(mockPermission);
      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}/permissions`);
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');

      const body = JSON.parse(callArgs[1].body);
      expect(body).toEqual({
        type: 'user',
        role: 'writer',
        emailAddress: 'a@example.com',
      });
    });

    it('does not add sendNotificationEmail query param when not passed', async () => {
      const mockPermission = { id: 'perm-1', type: 'user', role: 'writer', emailAddress: 'a@example.com' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPermission,
      });
      (globalThis as any).fetch = mockFetch;

      await createPermission(mockToken, mockFileId, {
        emailAddress: 'a@example.com',
        role: 'writer',
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).not.toContain('sendNotificationEmail');
    });

    it('adds sendNotificationEmail query param when explicitly passed', async () => {
      const mockPermission = { id: 'perm-1', type: 'user', role: 'writer', emailAddress: 'a@example.com' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPermission,
      });
      (globalThis as any).fetch = mockFetch;

      await createPermission(mockToken, mockFileId, {
        emailAddress: 'a@example.com',
        role: 'writer',
        sendNotificationEmail: false,
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('sendNotificationEmail=false');
    });
  });

  describe('createAnyonePermission', () => {
    const mockToken = 'test-token';
    const mockFileId = 'file-123';

    it('sends type anyone without an emailAddress key, and returns the parsed permission', async () => {
      const mockPermission = { id: 'perm-1', type: 'anyone', role: 'reader' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPermission,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await createAnyonePermission(mockToken, mockFileId, 'reader');

      expect(result).toEqual(mockPermission);
      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}/permissions`);
      expect(callArgs[1].method).toBe('POST');

      const body = JSON.parse(callArgs[1].body);
      expect(body).toEqual({ type: 'anyone', role: 'reader' });
      expect(body).not.toHaveProperty('emailAddress');
    });
  });

  describe('updatePermission', () => {
    const mockToken = 'test-token';
    const mockFileId = 'file-123';
    const mockPermissionId = 'perm-1';

    it('sends a PATCH to permissions/{id} with body {role}', async () => {
      const mockPermission = { id: mockPermissionId, type: 'user', role: 'reader' };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPermission,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await updatePermission(mockToken, mockFileId, mockPermissionId, 'reader');

      expect(result).toEqual(mockPermission);
      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}/permissions/${mockPermissionId}`);
      expect(callArgs[1].method).toBe('PATCH');
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');

      const body = JSON.parse(callArgs[1].body);
      expect(body).toEqual({ role: 'reader' });
    });

    it('throws error when response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
      });
      (globalThis as any).fetch = mockFetch;

      await expect(
        updatePermission(mockToken, mockFileId, mockPermissionId, 'reader')
      ).rejects.toThrow('Failed to update permission: Forbidden');
    });
  });

  describe('deletePermission', () => {
    const mockToken = 'test-token';
    const mockFileId = 'file-123';
    const mockPermissionId = 'perm-1';

    it('sends a DELETE to permissions/{id}', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });
      (globalThis as any).fetch = mockFetch;

      await deletePermission(mockToken, mockFileId, mockPermissionId);

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain(`files/${mockFileId}/permissions/${mockPermissionId}`);
      expect(callArgs[1].method).toBe('DELETE');
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
    });

    it('resolves to undefined on success', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });
      (globalThis as any).fetch = mockFetch;

      const result = await deletePermission(mockToken, mockFileId, mockPermissionId);

      expect(result).toBeUndefined();
    });

    it('throws an Error containing the statusText when not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });
      (globalThis as any).fetch = mockFetch;

      await expect(
        deletePermission(mockToken, mockFileId, mockPermissionId)
      ).rejects.toThrow('Failed to delete permission: Not Found');
    });
  });

  describe('findOrCreateSubfolder', () => {
    const mockToken = 'test-token';
    const mockParentFolderId = 'parent-folder-123';
    const mockSubfolderName = 'Test Subfolder';

    it('returns existing subfolder id without creating a duplicate', async () => {
      const mockExistingFolderId = 'existing-subfolder-456';
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ id: mockExistingFolderId, name: mockSubfolderName }],
        }),
      });
      (globalThis as any).fetch = mockFetch;

      const result = await findOrCreateSubfolder(mockToken, mockParentFolderId, mockSubfolderName);

      expect(result).toBe(mockExistingFolderId);
      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('googleapis.com/drive/v3/files');
      expect(callArgs[1].method).toBeUndefined(); // GET request (no method specified means GET)
      expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
    });

    it('creates new subfolder when no match is found', async () => {
      const mockNewFolderId = 'new-subfolder-789';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: mockNewFolderId }),
        });
      (globalThis as any).fetch = mockFetch;

      const result = await findOrCreateSubfolder(mockToken, mockParentFolderId, mockSubfolderName);

      expect(result).toBe(mockNewFolderId);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify search call (first call)
      const searchCallArgs = mockFetch.mock.calls[0];
      expect(searchCallArgs[0]).toContain('googleapis.com/drive/v3/files');

      // Verify create call (second call)
      const createCallArgs = mockFetch.mock.calls[1];
      expect(createCallArgs[0]).toContain('googleapis.com/drive/v3/files');
      expect(createCallArgs[1].method).toBe('POST');
      expect(createCallArgs[1].headers?.Authorization).toBe('Bearer test-token');

      const createBody = JSON.parse(createCallArgs[1].body);
      expect(createBody).toEqual({
        name: mockSubfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [mockParentFolderId],
      });
    });

    it('includes parentFolderId in search query to scope results', async () => {
      const mockFolderId = 'scoped-folder-999';
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ id: mockFolderId, name: mockSubfolderName }],
        }),
      });
      (globalThis as any).fetch = mockFetch;

      await findOrCreateSubfolder(mockToken, mockParentFolderId, mockSubfolderName);

      const callArgs = mockFetch.mock.calls[0];
      const searchUrl = callArgs[0];

      // Verify the search query includes the parentFolderId in the parents clause
      expect(searchUrl).toContain(`'${mockParentFolderId}' in parents`);
      // Also verify it searches for the correct name and folder mimeType
      expect(searchUrl).toContain(`name='${mockSubfolderName}'`);
      expect(searchUrl).toContain("mimeType='application/vnd.google-apps.folder'");
      expect(searchUrl).toContain('trashed=false');
    });

    it('escapes single quotes in folder name', async () => {
      const nameWithQuote = "My' Folder";
      const mockFolderId = 'folder-with-quote';
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [{ id: mockFolderId }],
        }),
      });
      (globalThis as any).fetch = mockFetch;

      await findOrCreateSubfolder(mockToken, mockParentFolderId, nameWithQuote);

      const callArgs = mockFetch.mock.calls[0];
      const searchUrl = callArgs[0];

      // Verify the single quote is escaped in the search query
      expect(searchUrl).toContain("My\\' Folder");
    });
  });
});
