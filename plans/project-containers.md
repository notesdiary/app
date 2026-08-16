# Plan: Project Containers (Per-Project Database Isolation)

## Overview

Today the app has exactly one IndexedDB database (`notes-diary`) and no
concept of "projects." We're adding "project containers": each project gets
its own IndexedDB database, hard-isolated from every other project (no
shared tables, no `projectId` columns). Which project is active is driven
entirely by the URL hash (`#/project/<id>`). No hash, or an unknown project
id, shows a project picker screen.

A new small global "registry" database (`notes-diary-registry`, one store
`projects`) tracks `{id, name, dbName, createdAt}` for every project. It is
the only global state. There is no "current project" pointer anywhere —
the URL is the single source of truth for which project is active.

On first load after this ships, if the legacy `notes-diary` database exists
and the registry is empty, we silently create one registry row for it
(name "My Notes") pointing at the existing `notes-diary` database by its
literal name — we never rename or copy it. New projects get a fresh
database named `notes-diary-{projectId}`.

Google OAuth tokens move from a single global `localStorage` key into each
project's own `meta` store, so the same Drive login can be connected
independently per project. Drive backups for a new project live in
`Notes Diary/{project name}/` (a subfolder); the migrated "My Notes"
project keeps using the flat `Notes Diary/` root folder, permanently, as a
deliberate exception.

This touches `db.ts`, `entriesRepo.ts`, `metaRepo.ts`, `googleAuth.ts`,
`driveApi.ts`, `types.ts`, `App.tsx`, `LeftRail.tsx`, adds a new
`projectRegistry.ts`, a hash router, and a `ProjectPicker` component.

## Resolved Decisions

These are implementation-detail calls made to keep the change simple and
self-consistent. Not up for debate, just documented so the "why" is clear.

- **Registry stores `dbName` explicitly**, not just `id`. The migrated
  project's `dbName` is the literal `'notes-diary'`, which does not follow
  the `notes-diary-{id}` pattern new projects use. Every piece of code that
  needs a project's database name reads `project.dbName` from the registry
  row — it never derives it from `id`.
- **Project ids use `'proj-' + crypto.randomUUID()`** — same pattern as the
  existing `'fr-' + crypto.randomUUID()` filter-rule ids in `App.tsx`, and
  safer than the legacy entry-id scheme (`${date}-${time}-${Math.random()}`).
- **`db.ts` keeps a `Map<string, IDBPDatabase>` keyed by `dbName`** instead
  of a single module-level handle. This lets multiple project databases be
  open in the same tab without one clobbering the other, and avoids race
  conditions if a project switch happens while an old handle's promise is
  still resolving. It's barely more code than a single cached variable, so
  we don't bother with the "just close and reopen on switch" simpler
  option.
- **`entriesRepo.ts` and `metaRepo.ts` read an implicit "active project db
  name"** set once via a new `setActiveProjectDb(dbName)` call made when
  the app mounts into a project route, rather than threading a `dbName`
  param through every exported function. This is a deliberate bit of
  global-ish state. It's acceptable because the URL-driven model guarantees
  exactly one project is active per tab at a time — there's no scenario
  where two projects' repos need to be live simultaneously in the same
  render tree. `getDB()` with no arguments reads this stashed value.
- **`googleAuth.ts`'s module-level `tokenClient` stays a single singleton**,
  not a pool keyed by project id. Only one project is ever active per tab,
  so one token client per app instance is correct. Do not build a
  per-project token-client cache.
- **No per-project OAuth client credentials.** `VITE_GOOGLE_CLIENT_ID` and
  the GIS setup are unchanged and shared across all projects.
- **Drive folder structure is two-level for new projects, flat for the
  migrated project**, keyed off `dbName === 'notes-diary'` (a stable,
  structural check), not off project name. This is permanent, not a
  temporary migration shim to "fix" later.
- **Backup filenames are untouched.** `FilterRule`/`FileSyncState` and the
  `filter-rules`/`filter-sync-state` meta keys work exactly as today,
  per-project, because folder isolation already prevents cross-project
  filename collisions. No project-name prefixing is added anywhere.
- **Delete is local-only and irreversible.** Deleting a project runs
  `indexedDB.deleteDatabase(dbName)` and removes the registry row. It never
  touches Google Drive — any Drive folder/files for that project are left
  orphaned on purpose. UI must confirm before doing this.
- **Project CRUD is Create + Delete only. No rename**, and no fields beyond
  `name` (`id`, `dbName`, `createdAt` are all generated, not user-editable).
- **Name uniqueness is case-insensitive**, compared as
  `name.trim().toLowerCase()` against existing registry rows, checked only
  at creation time.

## Task List

Each task is a self-contained diff, ≤30 min. Do them roughly in order;
dependencies are noted.

### 1. `src/types.ts` — add `Project` type
Add after the existing `DriveMeta` type (currently ends at line 6):
```ts
export type Project = { id: string; name: string; dbName: string; createdAt: number; };
```
No dependencies.

### 2. `src/lib/db.ts` — parameterize `getDB`/`initDB` by `dbName`, add active-project stash
Replace the single `let db: IDBPDatabase<NotesDiaryDB> | null = null;` (line
7) with a `Map`:
```ts
const dbHandles: Map<string, Promise<IDBPDatabase<NotesDiaryDB>>> = new Map();
let activeProjectDbName: string | null = null;
```
Rewrite `initDB` (lines 9-38) to take a `dbName: string` param and open
`openDB<NotesDiaryDB>(dbName, 2, { ... })` (was hardcoded `'notes-diary'`
at line 14) — upgrade callback body (entries store, meta store, index
migration) is unchanged. Cache by inserting the open promise into
`dbHandles.set(dbName, openPromise)` before awaiting it (so concurrent
callers for the same `dbName` share one open) and return the resolved db.
Rewrite `getDB` (lines 40-45) to:
```ts
export async function getDB(dbName?: string): Promise<IDBPDatabase<NotesDiaryDB>> {
  const name = dbName ?? activeProjectDbName;
  if (!name) throw new Error('getDB called with no dbName and no active project set');
  if (!dbHandles.has(name)) {
    dbHandles.set(name, initDB(name));
  }
  return dbHandles.get(name)!;
}

export function setActiveProjectDb(dbName: string): void {
  activeProjectDbName = dbName;
}
```
`initDB` becomes callable directly with a `dbName` (used by
`projectRegistry.ts` to open new project DBs and by migration code) without
needing `setActiveProjectDb` first.
No dependencies.

### 3. `src/lib/projectRegistry.ts` — new file, registry CRUD
New file. Opens its own tiny DB (does NOT go through `db.ts`'s
project-scoped `getDB`, since the registry is global, not per-project):
```ts
import { openDB, IDBPDatabase } from 'idb';
import { Project } from '../types';

const REGISTRY_DB_NAME = 'notes-diary-registry';
let registryDb: Promise<IDBPDatabase<any>> | null = null;

function getRegistryDb(): Promise<IDBPDatabase<any>> {
  if (!registryDb) {
    registryDb = openDB(REGISTRY_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
      },
    });
  }
  return registryDb;
}

export async function listProjects(): Promise<Project[]> {
  const db = await getRegistryDb();
  return db.getAll('projects');
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getRegistryDb();
  return db.get('projects', id);
}

export async function createProject(name: string): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name cannot be empty');
  const existing = await listProjects();
  if (existing.some(p => p.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A project with that name already exists');
  }
  const id = 'proj-' + crypto.randomUUID();
  const project: Project = { id, name: trimmed, dbName: `notes-diary-${id}`, createdAt: Date.now() };
  const db = await getRegistryDb();
  await db.put('projects', project);
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  if (!project) return;
  const db = await getRegistryDb();
  await db.delete('projects', id);
  indexedDB.deleteDatabase(project.dbName);
}

export function _resetRegistryForTests(): void {
  registryDb = null;
}
```
`_resetRegistryForTests` exists only so tests can force a fresh
`openDB` call between cases; it does not delete data.
Depends on: Task 1 (`Project` type).

### 4. `src/lib/projectRegistry.ts` — migration function
In the same file, add:
```ts
const LEGACY_DB_NAME = 'notes-diary';
const MIGRATED_PROJECT_NAME = 'My Notes';

async function legacyDbExists(): Promise<boolean> {
  if (!('databases' in indexedDB)) {
    // Fallback for browsers without indexedDB.databases(): assume it might
    // exist and let openDB's upgrade-noop path confirm harmlessly is not
    // safe here (would create it), so just check via databases() only —
    // if unsupported, treat as "no legacy db" rather than risk creating one.
    return false;
  }
  const dbs = await indexedDB.databases();
  return dbs.some(d => d.name === LEGACY_DB_NAME);
}

export async function migrateLegacyDbIfNeeded(): Promise<void> {
  const projects = await listProjects();
  if (projects.length > 0) return; // registry already seeded, never re-seed
  if (!(await legacyDbExists())) return;

  const db = await getRegistryDb();
  const project: Project = {
    id: 'proj-' + crypto.randomUUID(),
    name: MIGRATED_PROJECT_NAME,
    dbName: LEGACY_DB_NAME,
    createdAt: Date.now(),
  };
  await db.put('projects', project);
}
```
The `projects.length > 0` guard makes this idempotent: it only ever fires
once, and never runs again once any project (migrated or new) exists.
Depends on: Task 3.

### 5. `src/lib/entriesRepo.ts` — switch to project-scoped `getDB()`
No signature changes needed to any exported function — each already does
`const db = await getDB();` inline (e.g. line 2 area of `createEntry`,
and similarly in `updateEntryText`, `archiveEntry`, `restoreEntry`,
`deleteEntryForever`, `putEntries`, `listAllEntries`,
`listAllArchivedEntries`, `countArchivedEntries`). Since `getDB()` now
reads the active project db name set by `setActiveProjectDb` (Task 2),
this file needs zero code changes — just re-verify by reading the file
that every call site uses `getDB()` with no dbName argument (so it picks
up the active project). If any call site passes no changes are required,
this task is a no-op verification pass; flag any stray hardcoded db
references if found (none expected).
Depends on: Task 2.

### 6. `src/lib/metaRepo.ts` — switch to project-scoped `getDB()`, add OAuth token functions
Same no-op verification as Task 5 for the six existing functions (each
already calls bare `getDB()`). Then add, after `setFilterSyncState` (ends
line 40):
```ts
const OAUTH_TOKEN_KEY = 'oauth-token';

export async function getOAuthToken(): Promise<string | null> {
  const db = await getDB();
  const token = await db.get('meta', OAUTH_TOKEN_KEY);
  return (token as string) ?? null;
}

export async function setOAuthToken(token: string): Promise<void> {
  const db = await getDB();
  await db.put('meta', token, OAUTH_TOKEN_KEY);
}

export async function clearOAuthToken(): Promise<void> {
  const db = await getDB();
  await db.delete('meta', OAUTH_TOKEN_KEY);
}
```
Note: `TokenData` in `googleAuth.ts` is a richer shape (`access_token`,
`expires_at`, `requested_at`) than a bare string — store the whole
`TokenData` object as the value, not just the access token string. Adjust
the snippet above to type the param/return as `TokenData`-shaped
(`Record<string, unknown>` is fine here since `metaRepo.ts` doesn't import
`TokenData` — keep it as `any` or a local inline type, matching the
loose-typing style already used for `FileSyncState`/`FilterRule` gets in
this file).
Depends on: Task 2.

### 7. `src/lib/googleAuth.ts` — move token storage into IndexedDB via metaRepo
Add `import { getOAuthToken, setOAuthToken, clearOAuthToken } from './metaRepo';`
at the top. Delete `TOKEN_STORAGE_KEY` (line 17) — no longer used.
Rewrite `getCachedToken` (lines 30-51) to be `async` and read via
`await getOAuthToken()` instead of `localStorage.getItem(TOKEN_STORAGE_KEY)`;
it must now call `await clearToken()` (also async, see below) instead of
`clearToken()` on the expiry branch (line 41).
Rewrite `saveToken` (lines 57-65) to be `async` and call
`await setOAuthToken(data)` instead of
`localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data))`.
Rewrite `clearToken` (lines 70-73) to be `async` and call
`await clearOAuthToken()` instead of `localStorage.removeItem(...)`.
Update every caller of these three now-async private helpers to `await`
them: `getAccessToken` (line 81 `getCachedToken()` -> `await
getCachedToken()`), the callback inside `requestAccessToken` (line 124
`saveToken(response.access_token)` -> the callback itself must become
`async (response: any) => { ...; await saveToken(...); ... }`), `revokeToken`
(lines 159 and 164 `clearToken()` -> `await clearToken()`), and
`getAuthStatus` (line 172-178) — this one is trickier since it's currently
synchronous; make it `async` too (`export async function getAuthStatus():
Promise<{ authenticated: boolean; cachedToken: boolean }>`) and `await
getCachedToken()` inside. `tokenClient` (line 13) and the coalescing
vars (lines 14-16) are unchanged per the Resolved Decisions singleton
call.
Depends on: Task 6.

### 8. `src/App.tsx` — update `getAuthStatus` call site for new async signature
Find the call(s) to `getAuthStatus()` in `App.tsx` and add `await` /
adjust the surrounding function to be async if it isn't already (it's
likely already inside an async effect body given the existing
`connectDrive`/load-on-mount patterns). Grep for `getAuthStatus(` to find
every call site before editing.
Depends on: Task 7.

### 9. `src/lib/driveApi.ts` — add `findOrCreateSubfolder` helper
After `findOrCreateAppFolder` (lines 3-26), add:
```ts
export async function findOrCreateSubfolder(token: string, parentFolderId: string, name: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentFolderId}' in parents`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const searchData = await searchResponse.json();

  if (searchData.files?.length > 0) {
    return searchData.files[0].id;
  }

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });
  const createData = await createResponse.json();
  return createData.id;
}
```
`findOrCreateAppFolder` itself is unchanged — it still returns the
top-level `Notes Diary` folder id.
No dependencies.

### 10. `src/App.tsx` — branch folder discovery on migrated vs new project
Find `handleDiscoverDriveFolder` (Drive folder discovery, called from
`connectDrive`). After it resolves the top-level folder id via
`findOrCreateAppFolder(token)`, add branching: if the active project's
`dbName === 'notes-diary'` (the migrated project), use that top-level
folder id directly as before. Otherwise, call
`findOrCreateSubfolder(token, topLevelFolderId, activeProject.name)` and
use its result as the effective `driveFolderId` that gets persisted via
`setDriveMeta`. This requires the active `Project` object (from the
registry) to be available in `App.tsx` state — wire it in during Task 13.
Import `findOrCreateSubfolder` from `./lib/driveApi`.
Depends on: Task 9, Task 13 (needs active project in state).

### 11. `src/lib/router.ts` — new minimal hash router
New file:
```ts
export type Route = { name: 'picker' } | { name: 'project'; projectId: string };

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/project\/(.+)$/);
  if (match) return { name: 'project', projectId: decodeURIComponent(match[1]) };
  return { name: 'picker' };
}

export function navigateToPicker(): void {
  window.location.hash = '#/';
}

export function navigateToProject(projectId: string): void {
  window.location.hash = `#/project/${encodeURIComponent(projectId)}`;
}
```
No dependencies.

### 12. `src/hooks/useHashRoute.ts` — new hook wrapping the router
New file:
```ts
import { useEffect, useState } from 'react';
import { parseHash, Route } from '../lib/router';

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
```
Depends on: Task 11.

### 13. `src/components/ProjectPicker.tsx` — new component
New file. Props:
```ts
interface ProjectPickerProps {
  projects: Project[];
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
}
```
Renders a list of project names, each with an "Open" action (calls
`onOpen(project.id)`) and a "Delete" action gated behind a confirm step
(e.g. a native `window.confirm(...)` is fine for a first pass, or a small
inline confirm state — either way it must not delete on a single click).
Below the list, a text input + "Create" button calling `onCreate(name)`;
on failure (duplicate name) show the thrown error message inline, don't
let it crash the app (wrap the call in try/catch in the handler).
Depends on: Task 1.

### 14. `src/App.tsx` — load registry, wire router, render picker vs shell
- Import `useHashRoute` from `./hooks/useHashRoute`, `navigateToProject`,
  `navigateToPicker` from `./lib/router`, `listProjects`, `createProject`,
  `deleteProject`, `getProject`, `migrateLegacyDbIfNeeded` from
  `./lib/projectRegistry`, `setActiveProjectDb` from `./lib/db`,
  `ProjectPicker` from `./components/ProjectPicker`, and `Project` from
  `./types`.
- Add state: `const [projects, setProjects] = useState<Project[]>([]);`
  and `const [activeProject, setActiveProject] = useState<Project | null>(null);`.
- Add a top-level effect (runs once, independent of route) that calls
  `await migrateLegacyDbIfNeeded()` then `setProjects(await listProjects())`.
- Call `const route = useHashRoute();` near the top of the component body.
- When `route.name === 'project'`: look up the project by
  `route.projectId` (from the already-loaded `projects` list, or via
  `getProject` directly if not yet loaded), call
  `setActiveProjectDb(project.dbName)` and `setActiveProject(project)`
  before running the existing load-on-mount effect's body (guard that
  effect so it only runs once `activeProject` is set, and re-runs if
  `activeProject.id` changes — add `activeProject?.id` to its dependency
  array). If the id doesn't match any known project, call
  `navigateToPicker()`.
- When `route.name === 'picker'`: render `<ProjectPicker
  projects={projects} onCreate={handleCreateProject}
  onDelete={handleDeleteProject} onOpen={navigateToProject} />` instead of
  the existing app shell (`LeftRail` + main content). Do not run the
  entries/drive-loading effect while on the picker route.
- Add handlers: `handleCreateProject` (calls `createProject(name)`, then
  `setProjects(await listProjects())`), `handleDeleteProject` (calls
  `deleteProject(id)`, then `setProjects(await listProjects())` — if the
  deleted project was the active one, this can't happen from the picker
  screen since the picker only renders when no project is active, so no
  extra guard is needed).
Depends on: Tasks 2, 3, 4, 11, 12, 13.

### 15. `src/App.tsx` — "Switch Project" wiring
Add a handler `handleSwitchProject = () => navigateToPicker();` and pass it
to `LeftRail` as a new `onSwitchProjectClick` prop alongside the existing
`onSettingsClick`/`onArchiveClick`/`onAboutClick` props (LeftRail render
call, same block as the other four handler props).
Depends on: Task 14, Task 16.

### 16. `src/components/LeftRail.tsx` — add "Switch Project" control
Add `onSwitchProjectClick: () => void;` to `LeftRailProps` (after
`onAboutClick`, line 13). Add a button in `left-rail-header` (lines 54-57),
after the `app-title` div:
```tsx
<button className="switch-project-button" onClick={props.onSwitchProjectClick} title="Switch Project">
  Switch Project
</button>
```
Style it minimally in `LeftRail.css` to sit inline with the header (small
text button, not a primary CTA) — match existing button styling
conventions in that file rather than inventing a new visual language.
No dependencies (props are additive, doesn't break existing callers until
Task 15 wires the real handler — until then pass a no-op in any test
render calls that don't care about it).

### 17. `src/__tests__/googleAuth-concurrentSync.test.ts` — add fake-indexeddb setup
This test currently mocks `localStorage` as a plain object and does
`await import('../lib/googleAuth')` per test. Since token storage now
routes through `metaRepo.ts` -> `db.ts` -> real `getDB()`, add
`import 'fake-indexeddb/auto';` at the top (mirror the pattern in
`src/__tests__/entriesRepo.test.ts` line 2) and, in each test (or a
`beforeEach`), call `setActiveProjectDb('test-db-' + <unique>)` (import
from `../lib/db`) before the dynamic `await import('../lib/googleAuth')`,
so each test gets a clean, isolated database instead of colliding on a
shared name across the test file. Remove the `localStorage` mock object
entirely if nothing else in the file depends on it — grep the file first
to confirm. The core assertion (concurrent `getAccessToken()` calls
coalesce onto one `initTokenClient(...).requestAccessToken()` call) is
unchanged.
Depends on: Task 7.

### 18. `src/__tests__/googleAuth-integration.test.ts` — same fake-indexeddb setup
Same treatment as Task 17: add `fake-indexeddb/auto` import,
`setActiveProjectDb` call per test with a unique db name, drop the
`localStorage` mock if unused elsewhere in the file. The core assertion
(two sequential `requestAccessToken('consent')` calls each resolve
correctly, no stale closure) is unchanged.
Depends on: Task 7.

### 19. `src/__tests__/projectRegistry.test.ts` — new test file
New file, `import 'fake-indexeddb/auto';` at top, `import { _resetRegistryForTests }` and reset it in `beforeEach` (or use `indexedDB.deleteDatabase('notes-diary-registry')` in `beforeEach` then reset the cached promise). Cover:
- `createProject('Foo')` then `listProjects()` returns one project with
  `name: 'Foo'`, a `proj-`-prefixed `id`, `dbName: 'notes-diary-' + id`,
  and a numeric `createdAt`.
- `createProject('Foo')` then `createProject('foo')` (different case)
  rejects/throws (case-insensitive uniqueness).
- `createProject('  Foo  ')` then `createProject('Foo')` throws (trim
  before compare).
- `deleteProject(id)` removes the row from `listProjects()`.
- `deleteProject` for an unknown id is a no-op (doesn't throw).
Depends on: Tasks 3.

### 20. `src/__tests__/projectRegistryMigration.test.ts` — new test file
New file, `fake-indexeddb/auto`. Cover:
- With a pre-existing `notes-diary` database (opened once via `initDB`
  from `../lib/db` before calling migration, to simulate a real legacy
  install) and an empty registry, `migrateLegacyDbIfNeeded()` creates
  exactly one registry row with `name: 'My Notes'` and
  `dbName: 'notes-diary'`.
- Calling `migrateLegacyDbIfNeeded()` a second time does not create a
  second row (idempotent) — `listProjects()` still returns exactly one
  row after two calls.
- With no legacy `notes-diary` database present at all, and an empty
  registry, `migrateLegacyDbIfNeeded()` creates zero rows.
- With an existing registry row already present (simulating a
  new-projects-only user) and no legacy db, `migrateLegacyDbIfNeeded()`
  is a no-op and doesn't touch the existing row.
Depends on: Task 4.

### 21. `src/__tests__/db.test.ts` — new test file for `getDB` Map behavior
New file, `fake-indexeddb/auto`. Cover:
- `initDB('db-a')` and `initDB('db-b')` return different `IDBPDatabase`
  handles whose `.name` fields are `'db-a'` and `'db-b'` respectively.
- After `setActiveProjectDb('db-a')`, `getDB()` (no args) returns a handle
  for `'db-a'`.
- `getDB()` called with no args and no prior `setActiveProjectDb` call
  throws.
- `getDB('db-c')` (explicit arg) works independent of whatever
  `setActiveProjectDb` was last set to.
Depends on: Task 2.

### 22. `src/__tests__/router.test.ts` — new test file
New file, no IndexedDB needed. Cover:
- `parseHash('#/project/proj-abc123')` returns
  `{ name: 'project', projectId: 'proj-abc123' }`.
- `parseHash('')` and `parseHash('#/')` both return `{ name: 'picker' }`.
- `parseHash('#/project/')` returns `{ name: 'picker' }` (empty id after
  the slash is not a valid project route — decide this matches the regex:
  `.+` requires at least one char, so `#/project/` falls through to the
  picker default; assert this explicitly since it's easy to get wrong).
- A project id containing a URL-encoded character round-trips: given
  `navigateToProject('proj-a b')` sets `window.location.hash` to an
  encoded value, `parseHash` on that same hash decodes back to
  `'proj-a b'`.
Depends on: Task 11.

### 23. `src/__tests__/driveApi.test.ts` — add `findOrCreateSubfolder` coverage
Add a describe block mirroring the existing `findOrCreateAppFolder`-style
tests in this file (check the file for how Drive `fetch` calls are mocked
today and reuse that pattern). Cover:
- Given a `fetch` mock that returns an existing matching subfolder id on
  search, `findOrCreateSubfolder` returns that id and never issues a
  create (POST) call.
- Given a `fetch` mock that returns zero matches on search,
  `findOrCreateSubfolder` issues a create call with `parents: [parentFolderId]`
  and returns the new folder's id.
- The search query sent includes the given `parentFolderId` (asserted via
  the mocked `fetch` call args), so folders are only matched within that
  parent, not globally.
Depends on: Task 9.

### 24. Full repo grep sweep for leftovers
`grep -rn "notes_diary_oauth_token\|TOKEN_STORAGE_KEY" src/` — should
return nothing (fully replaced by IndexedDB-backed token storage). `grep
-rn "'notes-diary'" src/` — every remaining hit should be either the
`LEGACY_DB_NAME`/migration-related constant in `projectRegistry.ts` or a
test fixture, never a hardcoded call to `openDB`/`getDB` outside `db.ts`'s
own migration path.
Depends on: Tasks 1-23.

### 25. Build + test pass
`npm run build` (catches TS fallout from the now-async `googleAuth.ts`
functions and any missed call-site `await`s) and `npm test` (full suite
green). Fix any fallout.
Depends on: Task 24.

## Test Cases

- `createProject` generates a `proj-`-prefixed id, a matching
  `notes-diary-{id}` `dbName`, and a `createdAt` timestamp.
- `createProject` rejects a name that's a case-insensitive, trimmed
  duplicate of an existing project's name.
- `deleteProject` removes the registry row and calls
  `indexedDB.deleteDatabase` for that project's `dbName`; deleting an
  unknown id is a no-op.
- `migrateLegacyDbIfNeeded` seeds exactly one `{name: 'My Notes', dbName:
  'notes-diary'}` row when a legacy `notes-diary` database exists and the
  registry is empty, and never seeds a second row on repeated calls.
- `migrateLegacyDbIfNeeded` does nothing when there's no legacy db, and
  does nothing when the registry already has any row (even unrelated to
  migration).
- `getDB()` with no active project set (no prior `setActiveProjectDb`
  call) throws rather than silently opening a default database.
- `getDB('x')` and `getDB('y')` return distinct, independently cached
  `IDBPDatabase` handles.
- `parseHash` maps `#/project/<id>` to `{name: 'project', projectId: <id>}`
  and everything else (`''`, `'#/'`, `'#/project/'`) to `{name: 'picker'}`.
- `entriesRepo` functions (`createEntry`, `listAllEntries`, etc.) operate
  against whichever database `setActiveProjectDb` last pointed at — writes
  to one project's db never appear in another project's `listAllEntries()`.
- `metaRepo.getOAuthToken`/`setOAuthToken`/`clearOAuthToken` round-trip
  through the `meta` store's `'oauth-token'` key.
- `googleAuth.getAccessToken`/`requestAccessToken`/`revokeToken` no longer
  touch `localStorage` at all (no `localStorage.getItem`/`setItem`/
  `removeItem` calls with the old `notes_diary_oauth_token` key anywhere).
- Two projects with separately connected Google accounts each keep their
  own cached OAuth token — connecting/disconnecting Drive in one project's
  db has no effect on another project's stored token.
- `googleAuth-concurrentSync.test.ts`: concurrent `getAccessToken()` calls
  still coalesce onto a single `initTokenClient(...).requestAccessToken()`
  call, now against a fake-indexeddb-backed token store.
- `googleAuth-integration.test.ts`: two sequential `requestAccessToken('consent')`
  calls each resolve correctly with no stale closure, now against a
  fake-indexeddb-backed token store.
- `findOrCreateSubfolder` returns an existing subfolder's id without
  creating a duplicate when one already exists under the given parent;
  creates one scoped to `parents: [parentFolderId]` when none exists.
- For the migrated project (`dbName === 'notes-diary'`), Drive folder
  discovery uses the flat `Notes Diary/` root folder id directly — never
  calls `findOrCreateSubfolder`.
- For a new project (`dbName !== 'notes-diary'`), Drive folder discovery
  calls `findOrCreateSubfolder` with the project's `name` and uses its
  result as the effective folder id.
- `ProjectPicker` renders every project from `projects` with an Open and a
  Delete action; clicking Delete does not delete without a confirm step;
  confirming calls `onDelete(id)`.
- `ProjectPicker`'s create form calls `onCreate(name)` and surfaces a
  duplicate-name error inline without crashing when `onCreate` rejects.
- Navigating to `#/` with no project id renders `ProjectPicker`, not the
  diary shell.
- Navigating to `#/project/<valid-id>` renders the diary shell (`LeftRail`
  + main content) with entries loaded from that project's database, and
  calls `setActiveProjectDb` with that project's `dbName` before loading
  entries.
- Navigating to `#/project/<unknown-id>` redirects back to `#/` (picker).
- Clicking "Switch Project" in `LeftRail` navigates the hash back to `#/`.
- `LeftRail`'s `onSwitchProjectClick` prop is called exactly once per
  click, same wiring pattern as `onSettingsClick`/`onArchiveClick`.

## Acceptance Criteria

- Each project's entries, archive, filter rules, filter sync state, and
  OAuth token live in that project's own IndexedDB database, with zero
  cross-project data bleed.
- The registry (`notes-diary-registry`) contains only `{id, name, dbName,
  createdAt}` rows and never stores a "current project" pointer.
- A user with a pre-existing `notes-diary` database sees their existing
  entries unchanged after upgrading, now reachable at
  `#/project/<migrated-id>`, without any prompt or manual step, and
  without the underlying `notes-diary` database being renamed or copied.
- Visiting the app with no project in the URL (or an unknown project id)
  always shows the project picker, never a blank or broken shell.
- Creating a project enforces case-insensitive, trimmed name uniqueness;
  there is no rename feature anywhere in the UI or API.
- Deleting a project removes its IndexedDB database and registry row and
  requires a confirm step; it never touches Google Drive.
- Connecting Google Drive in one project has no effect on any other
  project's Drive connection state or cached token.
- New projects' Drive backups live under `Notes Diary/{project name}/`;
  the migrated project's backups stay under the flat `Notes Diary/` root,
  permanently, by design.
- Backup filenames and the `filter-rules`/`filter-sync-state` meta keys
  are unchanged from today's behavior, just now scoped per-project.
- No code outside `db.ts`/`projectRegistry.ts` hardcodes `'notes-diary'`.
- `npm run build` and `npm test` both pass clean.

## Open Questions

None outstanding. The isolation model, migration behavior, URL scheme,
CRUD scope, uniqueness rule, delete semantics, OAuth token isolation, the
`tokenClient` singleton decision, and the Drive folder structure (including
the migrated-project exception) were all specified up front and are
captured in Resolved Decisions and the Task List above.

One thing worth a sanity check during implementation rather than
re-litigation: `indexedDB.databases()` (used by `legacyDbExists` in Task
4) isn't supported in every browser/test environment. The task already
falls back to "assume no legacy db" if it's missing, which is safe (no
data loss, worst case a returning user briefly sees an empty picker and
manually recreates/re-opens nothing is lost since their data is still in
`notes-diary` untouched) but is a real edge case worth a manual check in
whatever browser this ships to.
