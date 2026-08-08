import { createDriveSync } from '@open-webapp/drive-sync';
import type { DrivePermission as LibDrivePermission } from '@open-webapp/drive-sync';

/**
 * The library's DrivePermission type only carries the fields its own
 * permissions.list() request asks the Drive API for (id/type/role/
 * emailAddress) — it does not request `displayName`. The app's Share UI
 * used to show a person's Drive-reported display name (from the old
 * driveApi.ts's DrivePermission, which had the same field but nothing
 * actually populating it beyond what the raw fetch response returned).
 * Kept here as an app-side extension so callers compile, but note this is
 * effectively always `undefined` now — see App.tsx/SettingsView.tsx call
 * sites, which already tolerate a missing displayName by falling back to
 * email.
 */
export type DrivePermission = LibDrivePermission & { displayName?: string };

const APP_ID = 'notesdiary';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const TOP_LEVEL_FOLDER = 'Notes Diary';

/**
 * Single app-wide drive-sync facade, used for everything except
 * folder-path resolution: connect/disconnect/getConnection, activate(),
 * reconcile(), dropProject(), and file/permission ops once a folder id is
 * already known. `folderPath` here is load-bearing and silent-failure-prone:
 * a wrong value does not error, it just creates a fresh EMPTY Drive folder,
 * and every existing user's backup appears to have vanished. See
 * drive.test.ts for a test that pins this exact array.
 */
export const drive = createDriveSync({
    appId: APP_ID,
    clientId: CLIENT_ID,
    folderPath: [TOP_LEVEL_FOLDER],
});

/**
 * Resolves (creating if needed) the Drive folder a given project's backup
 * files live in, preserving the pre-migration layout: the legacy migrated
 * project (the original single-project app, `dbName === 'notes-diary'`)
 * uses the top-level "Notes Diary" folder directly; every other project
 * gets its own subfolder named after the project, nested under it.
 *
 * The frozen `createDriveSync` factory's `folderPath` is fixed per
 * instance and has no per-project argument, so this creates a fresh,
 * short-lived instance with a project-scoped `folderPath` purely to walk
 * that path — cheap and side-effect-free (`createDriveSync` itself makes no
 * network calls). It shares the same underlying token/connection storage as
 * the `drive` singleton above (storage.ts keys IndexedDB purely by
 * `(appId, projectId)`, never by `folderPath`), so this must NOT have its
 * own `.activate()` called — the singleton already owns that.
 */
export function ensureProjectFolderId(
    projectId: string,
    projectName: string,
    isLegacyProject: boolean
): Promise<string> {
    const folderPath = isLegacyProject ? [TOP_LEVEL_FOLDER] : [TOP_LEVEL_FOLDER, projectName];
    const scoped = createDriveSync({ appId: APP_ID, clientId: CLIENT_ID, folderPath });
    return scoped.project(projectId).ensureFolderPath();
}

/**
 * Ensures a filename ends with `.json`. Moved from driveApi.ts — this is
 * app-side filename policy with no equivalent in the drive-sync library.
 */
export function ensureJsonExtension(fileName: string): string {
    const trimmed = fileName.trim();
    if (trimmed.endsWith('.json')) {
        return trimmed;
    }
    return trimmed + '.json';
}
