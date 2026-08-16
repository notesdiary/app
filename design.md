# Design — Notes Diary

Sibling docs: [product-behavior.md](./product-behavior.md), [schema-spec.md](./schema-spec.md)

## Directory structure

```
src/
├── App.tsx              # Root: all state, routing dispatch, Drive sync orchestration
├── main.tsx              # Entry point, persistent-storage request, React root
├── types.ts               # Entry, Project, FilterRule, FileSyncState, DriveMeta
├── components/            # React UI (one .tsx + colocated .css per component)
├── hooks/
│   ├── useHashRoute.ts        # subscribes to window hashchange, returns Route
│   ├── useWindowWidth.ts      # tracks window.innerWidth
│   └── useAutoGrowTextarea.ts # auto-resizes a textarea ref to its content
├── lib/
│   ├── db.ts               # per-project IndexedDB handle map + active-db pointer
│   ├── projectRegistry.ts  # top-level registry DB (project CRUD, legacy migration)
│   ├── router.ts            # hash <-> Route parsing/navigation
│   ├── entriesRepo.ts       # entry CRUD against the active project DB
│   ├── metaRepo.ts          # meta store: drive-meta, filter-rules, filter-sync-state
│   ├── drive.ts              # @open-webapp/drive-sync wiring, folder resolution
│   ├── dateUtils.ts          # date/time formatting
│   ├── tags.ts                # tag/section text parsing
│   ├── mode.ts                 # view-mode derivation
│   └── entryFiltering.ts       # entry/paragraph filtering by mode
└── __tests__/               # vitest + RTL, one file per lib module / component
```

## Component tree

```
App
├── ProjectPicker            (route === 'picker')
└── (route === 'project')
    ├── LeftRail              (tag browser, archive/settings/about/switch-project nav)
    ├── main
    │   ├── DiaryView          (view === 'diary')
    │   │   ├── DiaryHeader     (search box, hamburger)
    │   │   ├── Composer         (new-entry textarea, only shown in mode 'all')
    │   │   └── EntryList
    │   │       └── EntryRow × N  → EntryContent (renders parsed tag/text parts)
    │   ├── SettingsView        (view === 'settings'; local: shareModalOpenFileId, downloadMenuOpenRuleId)
    │   │   └── ShareModal        (Drive file sharing, opened per backup file)
    │   ├── ArchiveView         (view === 'archive', grouped by year-month)
    │   └── AboutView           (view === 'about')
    └── Backdrop                (mobile drawer overlay, isMobile && leftOpen)
```

## State management

All state lives in `App.tsx` via `useState`/`useEffect` — no reducer or external store. Grouped by concern:
- **Routing/projects**: `projects`, `activeProject`, `projectsLoaded`; driven by `useHashRoute()` + an effect that resolves `route` → `activeProject` and calls `setActiveProjectDb`.
- **Entries**: `entries` (active project, non-archived), `archivedCount`.
- **Drive**: `driveConnected`, `driveAccount`, `driveFolderId`, `needsReauth`, `filterRules`, `filterSyncState`.
- **Drive folder discovery** (picker route): `driveDiscoveredFolders` ({ name, modifiedTime }[] from Drive folders not matching local projects), `driveDiscoveryLoading` (fetch in flight).
- **UI filters**: `selectedTags`, `searchQuery` → derive `mode` (`lib/mode.ts`) → derive `filteredEntries` (`lib/entryFiltering.ts`).
- **Editing**: `editingId`, `draftText` (entry edit-in-place); `composerText` (new entry).
- **Responsive**: `width` (via `useWindowWidth`), `isMobile = width < 960`, `leftOpen`.

Every mutation writes to IndexedDB first (`entriesRepo`/`metaRepo`), then updates in-memory state — no optimistic-then-rollback pattern except in `SettingsView`'s share-permission handlers (see below).

## Multi-project architecture

- `projectRegistry.ts` owns `notes-diary-registry` IndexedDB (`projects` store, keyPath `id`). Each `Project` record points at its own separate entries database via `dbName`.
- `db.ts` keeps a `Map<dbName, IDBPDatabase>` of open handles and one module-level "active" `dbName`, set by `setActiveProjectDb()`. `entriesRepo`/`metaRepo` always call `getDB()` with no argument, resolving to whichever project is active — callers must ensure the active project is set before invoking them.
- On mount, `App.tsx` calls `migrateLegacyDbIfNeeded()` (creates a "My Notes" project pointing at the pre-existing `notes-diary` DB if the registry is empty and that DB exists), then `listProjects()`, then `drive.reconcile(projectIds)` to drop drive-sync's per-project auth DBs for projects no longer in the registry.
- Route resolution effect: `route.name === 'project'` → look up project in `projects`, call `setActiveProjectDb(project.dbName)` + `setActiveProject(project)`; not found → `navigateToPicker()`.

## Google Drive sync design

Built on `@open-webapp/drive-sync` (external package: OAuth token lifecycle, storage, low-level Drive file/permission ops; see its own `SPEC.md`). App owns everything below.

- `drive.ts` exports one app-wide `drive` singleton via `createDriveSync({ appId: 'notesdiary', clientId, folderPath: ['Notes Diary'] })`. `drive.activate()` is called once in an `App.tsx` effect (background token-refresh listeners), disposed on unmount.
- `ensureProjectFolderId(projectId, projectName, isLegacyProject)` resolves a project's Drive folder: legacy project → top-level `Notes Diary` folder; every other project → `Notes Diary/<projectName>` subfolder. Implemented by constructing a throwaway `createDriveSync` instance scoped to that `folderPath` purely to call `.ensureFolderPath()` — this instance must never call `.activate()` (the singleton owns that; storage is keyed by `(appId, projectId)`, not `folderPath`, so this is safe to create repeatedly).
- **Filter-rule sync model**: `FilterRule[]` (persisted in `meta` store) map a text filter → a backup filename. One rule may be `isRemainder: true` (matches everything not matched by another rule's filter); auto-seeded on first load if no rules exist.
- `getFilterMatches(rule, entries)`: non-remainder rules match active (non-archived) entries whose `text.toLowerCase()` includes the filter (lowercased, trimmed); the remainder rule matches active entries not matched by any other non-remainder rule with a non-empty filter.
- `syncFilterRule(id)`: verify connection (`needsReauth` check) → `ensureDriveFolderId()` → if no known `driveFileId`, self-heal by listing Drive files in the folder named `<fileName>.json` (handles files created from another device) → if found, read remote JSON, union with local matches by `id` (local wins on collision), persist remote-only entries locally, write merged array back → if not found, create the file with local matches. Updates `filterSyncState[id]` to `{status: 'synced', lastSynced, driveFileId}`.
- `syncAllFilters()` runs `syncFilterRule` for every non-skippable, non-duplicate-filename rule in parallel (`Promise.all`).
- `syncAllNow()` = `handleDiscoverDriveFolder()` (pull) then `syncAllFilters()` (push), so a browser holding no `driveFileId` and none of the other device's rules still pulls first. Bound to "Sync filters now" and auto-runs every 5 minutes while `driveConnected` (separate `useEffect` with `setInterval`).
- `handleDiscoverDriveFolder()`: resolve+persist the project's Drive folder → list its JSON files → pass 1: for each local rule whose `<fileName>.json` exists and has no recorded `driveFileId`, read it and record `filterSyncState[ruleId]` → pass 2: read every remaining JSON file in the folder (filter rules are local-only and never stored on Drive, so files produced by another device's rules match no local rule); these are pulled read-only, no rule is created for them. All entries from both passes are merged union-by-id (local wins) and persisted once.
- `needsReauth` is recomputed locally (no network call) from `drive.project(id).getConnection()` on connect and every 60s while connected.
- `connectDrive()`: interactive `connect()` → set state → verify by resolving the Drive folder (100ms delay for token storage to settle) → `handleDiscoverDriveFolder()` to pull down every backup file already in the project's folder.

## Data flows

- **New entry**: `Composer` text → `onBlur` → `handleComposerBlur` → `createEntry(date, time, text)` (writes IndexedDB, generates id `date-time-random`) → prepend to `entries` state.
- **Edit entry**: click a paragraph/section → `handleEntryClickToEdit` sets `editingId`/`draftText` → textarea `onBlur` → `handleEditSave` → `updateEntryText` (empty text deletes the entry) → update or remove from `entries` state.
- **Archive entry**: × button → `handleEntryRemove` → `archiveEntry` (sets `archived: true`, entry stays in DB) → remove from `entries`, increment `archivedCount`.
- **Restore/delete forever**: `ArchiveView` loads via `listAllArchivedEntries()` on mount; `restoreEntry`/`deleteEntryForever` update local `archivedEntries` state directly (no round-trip to `App.tsx`).
- **Filter/search**: `searchQuery`/`selectedTags` → `deriveMode` → `filterEntries`/`filterParagraphsInEntry` (both pure, re-derived on every render, not memoized). `filterParagraphsInEntry` consults `getEntryLevelTags` to determine whether to return all sections or only per-section-matched subsets.
- **Drive folder discovery** (picker route): on route change to 'picker', find first project with active Drive connection → resolve its top-level Drive folder (via `ensureProjectFolderId(..., true)` to force legacy behavior) → list immediate child folders → filter out names matching local projects (case-insensitive) → update `driveDiscoveredFolders` state for display.

## Design patterns

- Presentational components receive all data and callbacks as props from `App.tsx`; only `ArchiveView`, `ProjectPicker`, and `SettingsView` manage their own local state.
- `SettingsView` owns `shareModalOpenFileId` and `downloadMenuOpenRuleId` state; share-permission handlers (`handleInvite`, `handleRoleChange`, `handleRemove`, `handleGeneralAccessChange`) use optimistic local updates to `shareState`, rolling back on error.
- `App.tsx` owns `handleDownloadFilterRule` handler and `getFilterMatches`-based export logic.
- Entry-level tags (tag-only sections): `isTagOnlySection`/`getEntryLevelTags` in `src/lib/tags.ts`, consumed only by `filterParagraphsInEntry` in `src/lib/entryFiltering.ts`; `filterEntries` and tag-counting in `LeftRail.tsx` remain unaffected.
- Section date tokens: `SECTION_DATE_TOKEN_RE` regex matches `@YYYY-MM-DD` tokens at word boundaries (preceded by whitespace or string start, not followed by a digit). `isValidCalendarDate(y, m, d)` validates dates via `Date.UTC` roundtrip. `findAcceptedDateToken(section)` returns the first valid date token with its position, raw text, and ISO string; `parseSectionDate(section)` returns the ISO string or null.
- No CSS framework: component-scoped `.css` files imported alongside each `.tsx`, plus shared tokens in `src/styles/tokens.css` and TS color constants in `src/styles/app-colors.ts`.
