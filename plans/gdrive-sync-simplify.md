# Plan: Simplify Google Drive Sync to Filter-Mode-Only

## Overview

Today the app has two Drive sync modes: "sync all" (one file per month) and
"sync by filters" (custom rules, one file per rule). We are deleting "sync
all" entirely. Filter mode becomes the only mode. No mode toggle. On load, if
a user has zero filter rules, we auto-seed one default remainder rule so
backup starts working with no setup.

This is a deletion-heavy refactor across `driveApi.ts`, `metaRepo.ts`,
`App.tsx`, `SettingsView.tsx`, `types.ts`, tests, and `AGENTS.md`.

Old Drive files from month-sync (e.g. "July 2026.json") are left alone. We
never read the old `sync-mode` key again. No migration banner.

## Resolved Decisions

These were not explicitly covered by the stakeholder interview but are
required to make the deletion compile and behave sanely. Flagging here so
the change is intentional, not accidental.

- **`fileSyncState` (month-keyed) is deleted wholesale**, not just the two
  metaRepo functions. It cascades: `App.tsx` state var `fileSyncState`,
  the `getFileSyncState`/`setFileSyncState` calls on load and in
  `disconnectDrive`, the `monthMatchCounts` prop, and all month-list UI in
  `SettingsView.tsx`. `FileSyncState` the **type** stays — it's reused for
  `filterSyncState` (per-rule).
- **`handleDiscoverDriveFolder` is repurposed, not deleted.** Today it does
  two things: (a) find-or-create the Drive folder, (b) build a month-keyed
  `fileSyncState` by listing files and calling `extractMonthFromFilename`.
  (b) is replaced, not dropped: on discovery, list Drive files
  (`listBackupFiles`), and for any file that doesn't correspond to an
  already-synced local filter rule, download it and merge its entries into
  the browser (union-by-id, local-wins on collision — same merge rule as
  `syncFilterRule` uses elsewhere) if that content isn't already present
  locally. This lets a user who reconnects Drive (or connects on a new
  device) pull down existing filter-based backup files without manually
  recreating each rule. Old month-sync files (e.g. "July 2026.json") don't
  match any filter rule's filename and are simply left alone — not deleted,
  not parsed, not surfaced.
- **`disconnectDrive`'s "delete local" option is removed entirely.**
  Month-tracked deletion no longer makes sense once month tracking is
  gone, and there's no clean equivalent mapping from "matched by a filter
  rule" to "safe to delete locally" (a rule can be edited/removed after
  entries already matched it, so filter-match is not a stable notion of
  "this was backed up"). `disconnectDrive` now just revokes the token and
  clears Drive state — no local entry deletion, no confirmation dialog for
  it.
- **Disconnected-state explanatory copy** ("I keep one backup file per
  month...") gets updated to describe filter-based backup instead.
- **Sync-footer button** always reads "Sync filters now" (was conditional
  on `syncMode`).

## Task List

Each task is a self-contained diff, ≤30 min. Do them roughly in order;
dependencies are noted.

### 1. `src/types.ts` — remove `SyncMode`
Delete `export type SyncMode = 'all' | 'filters';` (line 12). Keep
`SyncStatus`, `FilterRule`, `FileSyncState`, `DriveMeta` unchanged.
No dependencies.

### 2. `src/lib/driveApi.ts` — remove month-file functions
Delete `uploadMonthFile` (lines 94-109), `downloadMonthFile` (lines
122-134), `extractMonthFromFilename` (lines 150-177). Keep
`findOrCreateAppFolder`, `listBackupFiles`, `ensureJsonExtension`,
`uploadFileContent` (private helper, still used by `uploadNamedFile`),
`uploadNamedFile`, `deleteFile`.
No dependencies.

### 3. `src/lib/metaRepo.ts` — remove month sync-state and sync-mode storage
Delete `getFileSyncState`/`setFileSyncState` (lines 38-47) and the
`FILE_SYNC_STATE_KEY` const (line 6). Delete `getSyncMode`/`setSyncMode`
(lines 49-58) and `SYNC_MODE_KEY` const (line 7). Drop `SyncMode` from the
type import on line 1. Keep `getFilterRules`/`setFilterRules`,
`getFilterSyncState`/`setFilterSyncState`, `getDriveMeta`/`setDriveMeta`,
extra-dates functions untouched.
Depends on: Task 1 (SyncMode type gone).

### 4. `src/App.tsx` — remove `fileSyncState` state, mode state, and month sync functions
This is the biggest single task; consider running it as tightly-scoped
sub-edits but land as one commit since the file won't compile mid-way.

- Remove imports: `SyncMode`, `getFileSyncState`, `setFileSyncState`,
  `getSyncMode`, `setSyncMode` (line 7); `uploadMonthFile`,
  `downloadMonthFile`, `extractMonthFromFilename` (line 9).
- Remove state: `fileSyncState`/`setFileSyncStateLocal` (line 32),
  `syncMode`/`setSyncModeLocal` (line 35, default `'all'`).
- In the load-on-mount effect (lines 62-90): delete the "Load file sync
  state (for months)" block (lines 76-78) and the "Load filter sync mode"
  block (lines 80-82). Keep loading `filterRules` and `filterSyncState`.
  **Add the auto-seed**: after loading `rules`, if `rules.length === 0`,
  build `const seeded = [{ id: 'fr-' + crypto.randomUUID(), filter: '',
  fileName: 'notesdiary-backup.json', isRemainder: true }]`, call
  `setFilterRulesLocal(seeded)` and `await setFilterRules(seeded)` instead
  of using the loaded (empty) `rules`.
- Auto-sync effect dep array (line 113): drop `syncMode` and
  `fileSyncState`, keep `filterRules`.
- Delete `setSyncModeAll` (lines 143-146) and `setSyncModeFilters` (lines
  148-154) entirely — replaced by the auto-seed above. `addFilterRule`,
  `addRemainderRule`, `updateFilterRule`, `removeFilterRule` stay
  unchanged.
- Delete `syncMonth` (lines 412-472).
- Delete `syncAllMonths` (lines 549-558).
- Simplify `syncAllNow` (lines 566-572) to just `await syncAllFilters();`
  — no branching.
- Repurpose `handleDiscoverDriveFolder` (lines 574-613): keep
  find-or-create-folder + `setDriveFolderId` + `setDriveMeta` persist.
  Replace the `extractMonthFromFilename`/`newSyncState` logic with:
  `listBackupFiles`, then for each listed file whose name matches a
  configured filter rule's `fileName` but has no local `driveFileId` yet
  (or whose remote content isn't reflected locally), download it and
  merge into `entries` (union-by-id, local-wins — same rule
  `syncFilterRule` uses) and record the `driveFileId` in
  `filterSyncState`. Files that don't match any rule's filename
  (including old month files) are left untouched. Update callers
  (`connectDrive` line 651) accordingly. `syncAllMonths` (its other
  caller) is already deleted.
- `disconnectDrive` (lines 662-691): delete the month-keyed "delete local
  copies" logic (lines 668-676) outright — no replacement. Function now
  just revokes the token, clears Drive state (`driveFolderId`,
  `filterSyncState`'s Drive-file-id fields if applicable), and returns.
  Drop `await setFileSyncState({})` (line 687) — store no longer exists.
  If the disconnect confirmation dialog had a "also delete local copies"
  checkbox/option, remove that UI too (see Task 6).
- `SettingsView` prop wiring (lines 738-758): remove `fileSyncState`,
  `syncMode`, `monthMatchCounts`, `onSetSyncModeAll`,
  `onSetSyncModeFilters` props. Keep everything else.

Depends on: Tasks 1, 2, 3.

### 5. `src/lib/metaRepo.ts` sanity pass
Re-read the file after Task 3+4 to confirm no dangling references to
`FILE_SYNC_STATE_KEY`/`SYNC_MODE_KEY`. (Fold into Task 3 if you catch it
there — listed separately only as a checkpoint.)
Depends on: Task 3.

### 6. `src/components/SettingsView.tsx` — remove mode toggle and month UI
- Remove `SyncMode` from type import (line 2).
- Remove props from `SettingsViewProps`: `fileSyncState`, `syncMode`,
  `monthMatchCounts`, `onSetSyncModeAll`, `onSetSyncModeFilters` (lines
  8-9, 13, 17-18).
- Remove `getMonthName` helper (lines 114-123), `monthKeys` (line 125),
  `totalEntries` (line 126) — all month-only.
- Update `getStatusText` (lines 91-112): drop the unused `monthKey` param
  name confusion — it's actually generic (keyed by rule id going
  forward), just rename the param to `_key` or `id` for clarity; logic
  itself is unchanged and still used by the filter-file list.
- Delete the mode-toggle button row (lines 181-195, the
  `sync-mode-row` block).
- Delete the "Sync all mode: month-based backup files" block (lines
  197-236).
- Remove the `props.syncMode === 'filters' && (...)` wrapper condition
  around the filter UI (lines 239, 371) — filter UI always renders now
  when connected. Keep everything inside (`<>...</>`) unchanged content,
  minus the wrapper condition.
- Fix the gating bug per requirement 3: change (line 306)
  `props.filterRules.length > 0 && !props.filterRules.some(r =>
  r.isRemainder)` to just `!props.filterRules.some(r => r.isRemainder)`.
- Sync-footer button (lines 407-411): text always `'Sync filters now'`,
  drop the ternary.
- Update disconnected-state explanation copy (lines 155-158) to describe
  filter-based backup, e.g.: "While connected, entries matching your
  filters get backed up to their own file in Drive, and sync
  automatically. If you edit a file directly in Drive, I pick up those
  changes the next time I sync."

Depends on: Task 1 (type), Task 4 (prop shape from App.tsx must match).

### 7. Tests — delete month-sync test files
Delete `src/__tests__/driveRemoteOnlySync.test.tsx` and
`src/__tests__/fileSyncStatePersistence.test.tsx` outright — both test
month-sync behavior end-to-end (`syncMonth`/`syncAllMonths`/
`fileSyncState` persistence) that no longer exists.
Depends on: Task 4 (confirms behavior is really gone).

### 8. Tests — trim `driveApi.test.ts`
Remove the (currently absent from grep but check for) any
`uploadMonthFile`/`downloadMonthFile`/`extractMonthFromFilename` describe
blocks if present after a full read (the excerpt reviewed only showed
`ensureJsonExtension`, `uploadNamedFile`, `deleteFile` blocks — this file
may already be clean of month-function tests; verify by grepping for
`uploadMonthFile|downloadMonthFile|extractMonthFromFilename` before
editing). Keep `ensureJsonExtension`, `uploadNamedFile`, `deleteFile`
tests as-is.
Depends on: Task 2.

### 9. Tests — rewrite `SettingsView.test.tsx`
This file is 1693 lines and deeply coupled to `syncMode`/`fileSyncState`
props on nearly every render call. Plan:
- Remove `mockOnSetSyncModeAll`/`mockOnSetSyncModeFilters` and all
  `syncMode`/`fileSyncState`/`monthMatchCounts` props from every render
  call's props object (bulk find/replace, then spot check).
  A helper `baseProps` / `renderConnected(overrides)` object might already
  exist near the top — check and centralize prop-building there if not,
  to avoid a 100-line-touch diff.
- Delete the whole "Rendering tests" sub-block of numbered tests 1-5 that
  assert mode-conditional rendering (`syncMode="all"` vs `"filters"`,
  "Both lists are never shown simultaneously") — mode no longer exists,
  filter UI always renders.
- Delete the "Mode switching tests" sub-block (tests 6-7, clicking
  "Sync with filters"/"Sync all" buttons) — buttons are gone.
- Keep "Add filter tests" (8-11) but re-verify test 9 ("+ Add everything
  else is hidden when filterRules is empty") — per requirement 3 this
  should now be VISIBLE, not hidden. Flip the assertion and rename the
  test.
- Add new test: with `filterRules=[]`, the "+ Add everything else" button
  renders (covers the fixed gating condition standalone).
- Add new test: App-level auto-seed — this belongs more naturally as an
  `App.test.tsx`/integration test since `App.tsx` owns the seeding logic,
  not `SettingsView`. If no such App-level test file exists, add a
  focused one asserting: on mount with empty `filterRules` in IndexedDB,
  after load, `filterRules` state contains exactly one rule with
  `isRemainder: true`, `fileName: 'notesdiary-backup.json'`, `filter:
  ''`. Check whether an App-level test harness already exists before
  writing from scratch.
- Keep all "Disconnect dialog", "Back navigation", "Remove filter rule
  modal", per-rule sync-now/status coverage — untouched apart from prop
  cleanup.
Depends on: Tasks 4, 6.

### 10. `AGENTS.md` — update Google Drive Integration section
Rewrite lines 119-127 to describe filter-mode-only sync: connect via
OAuth, one backup file per filter rule (user-named), a remainder rule for
"everything else", manual "Sync now" (per rule) / "Sync filters now" (all
rules), per-rule sync status in `meta` store (`filter-sync-state`,
`filter-rules` keys), same union-by-id/local-wins merge. Mention that a
default remainder rule (`notesdiary-backup.json`) is auto-seeded for new
or migrating users with no filters configured, and that pre-existing
month-sync files in Drive are left untouched.
Depends on: Task 4 (behavior must be final before documenting it).

### 11. Full repo grep sweep for leftovers
`grep -rn "syncMode\|SyncMode\|fileSyncState\|FileSyncState\|uploadMonthFile\|downloadMonthFile\|extractMonthFromFilename\|getSyncMode\|setSyncMode\|getFileSyncState\|setFileSyncState\|sync-mode\|file-sync-state" src/` and confirm every remaining hit is either the `FileSyncState` type (legitimately reused for filter sync) or a `filterSyncState`/`filterSyncState`-adjacent name (legitimately kept). Anything else is a leftover to remove.
Depends on: Tasks 1-10.

### 12. Build + test pass
`npm run build` (catches TS errors from dangling references) and
`npm test` (full suite green). Fix any fallout.
Depends on: Task 11.

## Test Cases

- `ensureJsonExtension`, `uploadNamedFile`, `deleteFile` — unchanged
  coverage in `driveApi.test.ts`.
- No test anywhere references `uploadMonthFile`, `downloadMonthFile`, or
  `extractMonthFromFilename` (they don't exist).
- App load with empty `filterRules` in IndexedDB → after mount, exactly
  one filter rule exists: `isRemainder: true`, `fileName:
  'notesdiary-backup.json'`, `filter: ''`, and it's persisted via
  `setFilterRules` (not just in-memory).
- App load with existing non-empty `filterRules` → no seeding happens,
  rules loaded as-is.
- App load for a user who previously had `sync-mode: 'all'` (or missing)
  in the `meta` store and empty `filterRules` → same auto-seed happens
  (the old key is simply never read).
- `SettingsView` connected state: no mode-toggle buttons render anywhere
  in the DOM (query for "Sync all" / "Sync with filters" button text
  returns null).
- `SettingsView` connected state: no month-keyed "Backup files" list ever
  renders (no elements matching a month-name pattern like "July 2026").
- `SettingsView` with `filterRules = []`: "+ Add \"everything else\"
  filter" button IS visible (regression test for the gating-bug fix).
- `SettingsView` with a remainder rule already present: "+ Add
  \"everything else\" filter" button is hidden (existing behavior,
  unchanged).
- `SettingsView` filter-rule editor and per-rule sync-now/status UI
  render unconditionally when connected (no mode gate).
- `SettingsView` sync-footer button always reads "Sync filters now".
- `disconnectDrive` never deletes local entries (the option is removed);
  it revokes the Drive token and clears Drive state (`driveFolderId`,
  filter sync state's Drive file ids) every time it's called.
- `handleDiscoverDriveFolder` / `connectDrive`: given a Drive folder with
  a file matching a configured filter rule's filename, and that content
  not yet present locally, discovery downloads and merges it into
  `entries` (union-by-id, local-wins on collision) and records the
  `driveFileId`. A file that doesn't match any rule's filename (e.g. an
  old month file) is left untouched — not downloaded, not deleted, not
  parsed.
- `syncAllNow` calls `syncAllFilters` unconditionally (no branch to
  assert against, since `syncAllMonths` no longer exists — a test
  asserting it never calls a Drive month-upload endpoint would need a
  spy on `fetch`/`uploadNamedFile` showing only rule-named files are
  written).

## Acceptance Criteria

- `SyncMode` type, `sync-mode` meta key, and all month-sync functions
  (`uploadMonthFile`, `downloadMonthFile`, `extractMonthFromFilename`,
  `syncMonth`, `syncAllMonths`, `getSyncMode`, `setSyncMode`,
  `getFileSyncState`, `setFileSyncState`) are gone from the codebase.
- No mode toggle exists in the UI. Filter-based sync is the only path,
  always visible once Drive is connected.
- A brand-new user (or a migrating user with no filter rules) gets a
  single default remainder rule auto-seeded on load, named
  `notesdiary-backup.json`, with no manual step required.
- The "+ Add \"everything else\" filter" button is available as soon as
  zero filter rules exist (not gated behind having at least one other
  rule first).
- Existing filter rules, per-rule filenames, duplicate-filename
  detection, and per-rule sync-now/status UI behave exactly as before.
- Old Drive files from month-sync are never touched, read, or deleted by
  the app going forward.
- Discovery/connect downloads and merges existing filter-rule-matching
  Drive files into the browser when not already present locally; files
  not matching any rule are left alone.
- Disconnecting Drive never deletes local entries.
- `npm run build` and `npm test` both pass clean.
- `AGENTS.md`'s Google Drive Integration section accurately describes
  filter-mode-only sync.

## Open Questions

None outstanding — both items raised during planning (disconnect delete
behavior, discover/connect file listing) were resolved directly with the
stakeholder; resolutions are folded into the Resolved Decisions and Task
List sections above.

This repo has no `plans/` directory and no per-module
`product-behavior.md`/`design.md`/`schema-spec.md` docs (checked — none
exist, and `AGENTS.md` doesn't mandate them, it just references a
`plans/notes-diary-app.md` that no longer exists on disk). No such
follow-up doc is created as part of this plan.
