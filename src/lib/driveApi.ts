import { Entry } from '../types';

export async function findOrCreateAppFolder(token: string): Promise<string> {
  // Search for existing folder named "Notes Diary"
  const searchResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=name="Notes Diary" and mimeType="application/vnd.google-apps.folder" and trashed=false',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const searchData = await searchResponse.json();

  if (searchData.files?.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Notes Diary',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const createData = await createResponse.json();
  return createData.id;
}

export async function listBackupFiles(
  token: string,
  folderId: string
): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/json' and trashed=false&fields=files(id,name)`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = (await response.json()) as any;
  return (data.files as Array<{ id: string; name: string }>) || [];
}

export function ensureJsonExtension(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.endsWith('.json')) {
    return trimmed;
  }
  return trimmed + '.json';
}

async function uploadFileContent(
  token: string,
  folderId: string,
  filename: string,
  entries: Entry[],
  existingFileId?: string
): Promise<string> {
  const fileContent = JSON.stringify(entries, null, 2);

  if (existingFileId) {
    // Update existing file
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: fileContent,
      }
    );
    const data = await response.json();
    return data.id;
  } else {
    // Create new file
    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      }
    );
    const data = await response.json();
    return data.id;
  }
}

export async function uploadNamedFile(
  token: string,
  folderId: string,
  fileName: string,
  entries: Entry[],
  existingFileId?: string
): Promise<string> {
  const filename = ensureJsonExtension(fileName);
  return uploadFileContent(token, folderId, filename, entries, existingFileId);
}

export async function downloadFileContent(
  token: string,
  fileId: string
): Promise<any> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.statusText}`);
  }
}

export type DrivePermissionRole = 'owner' | 'reader' | 'commenter' | 'writer';

export interface DrivePermission {
  id: string;
  type: 'user' | 'anyone';
  role: string;
  emailAddress?: string;
  displayName?: string;
}

export async function listPermissions(
  token: string,
  fileId: string
): Promise<DrivePermission[]> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName)`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = (await response.json()) as any;
  return (data.permissions as DrivePermission[]) || [];
}

export async function createPermission(
  token: string,
  fileId: string,
  opts: { emailAddress: string; role: string; sendNotificationEmail?: boolean }
): Promise<DrivePermission> {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
  if (opts.sendNotificationEmail !== undefined) {
    url += `?sendNotificationEmail=${opts.sendNotificationEmail}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'user',
      role: opts.role,
      emailAddress: opts.emailAddress,
    }),
  });
  const data = await response.json();
  return data;
}

export async function createAnyonePermission(
  token: string,
  fileId: string,
  role: string
): Promise<DrivePermission> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'anyone',
        role,
      }),
    }
  );
  const data = await response.json();
  return data;
}

export async function updatePermission(
  token: string,
  fileId: string,
  permissionId: string,
  role: string
): Promise<DrivePermission> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`,
    {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update permission: ${response.statusText}`);
  }

  return response.json();
}

export async function deletePermission(
  token: string,
  fileId: string,
  permissionId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete permission: ${response.statusText}`);
  }
}

