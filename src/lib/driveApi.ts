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

export async function uploadMonthFile(
  token: string,
  folderId: string,
  monthKey: string,
  entries: Entry[],
  existingFileId?: string
): Promise<string> {
  // Format month name: "July 2026"
  const monthName = new Date(monthKey + '-01').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const filename = `${monthName}.json`;

  return uploadFileContent(token, folderId, filename, entries, existingFileId);
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

export async function downloadMonthFile(token: string, fileId: string): Promise<Entry[]> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
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

export function extractMonthFromFilename(filename: string): string | null {
  // Extract month key from filename like "July 2026.json" -> "2026-07"
  const match = filename.match(/^(\w+)\s+(\d{4})\.json$/);
  if (!match) return null;

  const monthName = match[1];
  const year = match[2];

  const monthMap: Record<string, string> = {
    January: '01',
    February: '02',
    March: '03',
    April: '04',
    May: '05',
    June: '06',
    July: '07',
    August: '08',
    September: '09',
    October: '10',
    November: '11',
    December: '12',
  };

  const month = monthMap[monthName];
  if (!month) return null;

  return `${year}-${month}`;
}
