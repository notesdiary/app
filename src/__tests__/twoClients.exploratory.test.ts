import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDriveSync } from '@open-webapp/drive-sync';
import { createDriveFake, createGisFake, type DriveFake, type GisFake } from '@open-webapp/drive-sync/testing';

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

function createHostFetch(driveFake: DriveFake): typeof fetch {
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request)?.url ?? String(input);
    if (url.startsWith(USERINFO_URL)) {
      return new Response(JSON.stringify({ email: 'shared-account@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.startsWith(REVOKE_URL)) {
      return new Response(null, { status: 200 });
    }
    return driveFake.fetch(input as any, init);
  }) as unknown as typeof fetch;
}

// Simulates the exact app-level algorithm (ensureProjectFolderId + the
// self-heal-by-name lookup + create-or-update) from src/lib/drive.ts and
// src/App.tsx's syncFilterRule, without going through React at all.
async function syncRemainderFile(
  projectHandle: ReturnType<ReturnType<typeof createDriveSync>['project']>,
  projectName: string,
  localEntries: unknown[]
) {
  const folderId = await projectHandle.ensureFolderPath();
  const fileName = 'notesdiary-backup.json';

  const existing = await projectHandle.files.list({
    folderId,
    mimeType: 'application/json',
    nameEquals: fileName,
  });

  if (existing.length > 0) {
    const fileId = existing[0].id;
    const remoteContent = await projectHandle.files.read(fileId);
    const remoteEntries = typeof remoteContent === 'string' ? JSON.parse(remoteContent) : [];
    const remoteOnly = remoteEntries.filter((r: any) => !localEntries.find((l: any) => l.id === r.id));
    const merged = [...localEntries, ...remoteOnly];
    await projectHandle.files.write({ fileId, content: JSON.stringify(merged), mimeType: 'application/json' });
    return { folderId, fileId, merged };
  }

  const file = await projectHandle.files.write({
    folderId,
    name: fileName,
    content: JSON.stringify(localEntries),
    mimeType: 'application/json',
  });
  return { folderId, fileId: file.id, merged: localEntries };
}

describe('Two independent clients, same Google account, same project name "notes" (no timing tricks)', () => {
  let gisFake: GisFake;
  let driveFake: DriveFake;

  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    gisFake = createGisFake();
    gisFake.install();
    driveFake = createDriveFake();
    vi.stubGlobal('fetch', createHostFetch(driveFake));
  });

  afterEach(() => {
    gisFake.uninstall();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('client B finds and reuses client A\'s existing "notes" folder + backup file', async () => {
    // ---- Seed Drive state exactly as Client A's real, already-completed
    // sync would have left it: a "Notes Diary/notes" folder containing
    // "notesdiary-backup.json" with A's entries. (Seeded directly rather than
    // driven through the real multipart create() call because jsdom's Request
    // does not serialize FormData bodies — a test-environment limitation, not
    // a production code path. The self-heal path under test below — list,
    // read, and fileId-based update — uses plain string bodies and IS
    // exercised for real against the fake Drive backend.)
    const notesDiaryFolderId = 'folder-notes-diary';
    const notesFolderId = 'folder-notes';
    const backupFileId = 'file-backup';
    driveFake.files.set(notesDiaryFolderId, {
      id: notesDiaryFolderId,
      name: 'Notes Diary',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [],
      content: '',
      version: 1,
    });
    driveFake.files.set(notesFolderId, {
      id: notesFolderId,
      name: 'notes',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [notesDiaryFolderId],
      content: '',
      version: 1,
    });
    driveFake.files.set(backupFileId, {
      id: backupFileId,
      name: 'notesdiary-backup.json',
      mimeType: 'application/json',
      parents: [notesFolderId],
      content: JSON.stringify([{ id: 'entry-A1', text: 'hello from A' }]),
      contentType: 'application/json',
      version: 1,
    });
    const resultA = { folderId: notesFolderId, fileId: backupFileId };

    // ---- Client B: a SEPARATE device (separate createDriveSync instance,
    // separate local projectId), same Google account, creates its OWN local
    // project also named "notes", makes changes, then syncs. Sequential, no
    // overlap with Client A's sync above. ----
    const clientB = createDriveSync({ appId: 'notesdiary', clientId: 'test-client-id', folderPath: ['Notes Diary', 'notes'] });
    gisFake.queueResponse({
      access_token: 'token-b',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    });
    const projectB = clientB.project('local-project-id-B');
    await projectB.connect();

    const resultB = await syncRemainderFile(projectB, 'notes', [{ id: 'entry-B1', text: 'hello from B' }]);

    // Bug-1 check: exactly ONE "notes" folder should exist — client B must
    // resolve to the SAME folder client A already created, not a duplicate.
    const notesFolders = [...driveFake.files.values()].filter(f => f.name === 'notes' && f.mimeType === 'application/vnd.google-apps.folder');
    expect(notesFolders).toHaveLength(1);
    expect(resultB.folderId).toBe(resultA.folderId);

    // Bug-1 check: exactly ONE backup file should exist — client B must
    // self-heal onto client A's existing file, not create a second one.
    const filesAfterB = [...driveFake.files.values()].filter(f => f.mimeType === 'application/json');
    expect(filesAfterB).toHaveLength(1);
    expect(resultB.fileId).toBe(resultA.fileId);

    // Bug-2 check: client B's changes must actually be present in the merged
    // remote file content (not silently dropped).
    const finalContent = JSON.parse(filesAfterB[0].content);
    const ids = finalContent.map((e: any) => e.id);
    expect(ids).toContain('entry-A1');
    expect(ids).toContain('entry-B1');
  });
});
