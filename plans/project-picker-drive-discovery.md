# Plan: project-picker-drive-discovery

## Prerequisites / blocking dependency (read this first)

This plan needs `modifiedTime` on Drive folder listings. `@open-webapp/drive-sync` (installed `^0.1.0`) does NOT return it today — `node_modules/@open-webapp/drive-sync/dist/types.d.ts` defines `FileRef` as only `{ id: string; name?: string }`. Verified at planning time (2026-08-15).

A companion library-side plan is supposed to add `modifiedTime` to `FileRef` and publish a new version. As of THIS planning session, that plan does **not exist yet** at `~/owa/owa/plans/drive-sync-modified-time.md` — checked, only `_template.md` and `drive-sync-picker.md` are present in that directory.

This app-side plan cannot finish past T3 (package bump) until: (1) the library plan is written, (2) implemented, (3) published to npm with `modifiedTime` on `FileRef`. Do NOT vendor/patch `node_modules`, do NOT hit the raw Drive API as a workaround. Wait for the real library update. T3 is marked BLOCKED below and every task after it is gated on T3.

## Goal

Project picker page (`#/`) currently only shows local projects. Add a read-only "Also in Google Drive" section below "Your Projects" listing Drive subfolders of the top-level "Notes Diary" folder that have no matching local project — so a user who's set up Drive backup on one device sees hints of other projects living in Drive when they open the app on a new device/browser. No buttons, no restore, just name + last-updated date.

## Scope

**In scope:**
- New "Also in Google Drive" section in `ProjectPicker.tsx`, rendered only when non-empty.
- New Drive-discovery state + one-shot `useEffect` in `App.tsx`, passed down as props.
- Loading indicator text while the check is in flight.
- Silent-fail-everything error handling (console.error only).
- `package.json` bump of `@open-webapp/drive-sync` (blocked task, see above).
- Tests: `ProjectPicker.test.tsx` (or extend if exists) + discovery-effect coverage.
- Doc updates: `design.md`, `product-behavior.md`, full-file review of both.

**Out of scope:**
- Any click/restore/import action on discovered folders.
- Polling/interval refresh of the discovery list.
- Treating loose files directly in the top-level "Notes Diary" folder as candidate projects.
- Any workaround for the missing `modifiedTime` field (vendoring, raw Drive API, patching node_modules).
- Changes to `drive.ts`'s singleton `folderPath` array (pinned by `drive.test.ts`).

## Resolved decisions

1. On `ProjectPicker` mount (route === picker), iterate local projects in order; call `drive.project(project.id).getConnection()` per project; use the FIRST project where `connection !== null && !connection.needsReauth`. If none found, or zero local projects, skip the whole feature (no fetch, no section, no loading state).
2. With that connected project, call `ensureProjectFolderId(projectId, projectName, true)` from `src/lib/drive.ts` to resolve the top-level "Notes Diary" folder id (the `true` forces legacy/top-level path regardless of whether that project is actually legacy — reuse existing helper, do not write new folderPath logic). Then `drive.project(projectId).files.list({ folderId, mimeType: 'application/vnd.google-apps.folder' })` to list immediate child folders.
3. A folder is "not present locally" if its `name` doesn't match (trim + lowercase) any local project's `name` — mirror `projectRegistry.ts` `createProject()`'s exact comparison (`existing.some(p => p.name.trim().toLowerCase() === trimmed.toLowerCase())`, line ~35).
4. Top-level "Notes Diary" folder itself is never a candidate, even with loose files directly inside — only true subfolders from the `files.list` call count. Intentional v1 limit.
5. Each row: folder name + "Last updated <date>" formatted from `modifiedTime` (blocked on T3, see prerequisites).
6. See prerequisites section above — blocking dependency on library field.
7. Fetch is one-shot on mount (`useEffect` with `[]`-equivalent deps gated on picker route), not polled. Loading text (e.g. "Checking Google Drive...") shown in-place, matching existing plain-text style in `ProjectPicker.tsx`.
8. Any error (network, needsReauth mid-flight, folder-resolution throw, `files.list` throw) → hide section entirely, no error UI, `console.error` only (mirrors `handleDeleteProject`'s `console.error('Delete error:', errorMessage)` pattern).
9. Purely informational rows — no click handlers, no buttons.
10. All Drive-discovery state/effect lives in `App.tsx` (mirrors `driveConnected` etc.), passed to `ProjectPicker` as new props. `ProjectPicker.tsx` stays dumb — no Drive imports inside it.

## Affected files

- `package.json` — bump `@open-webapp/drive-sync` to new version once published (blocked task).
- `src/App.tsx` — new state (`driveDiscoveredFolders`, `driveDiscoveryLoading`), new `useEffect` for one-shot discovery on picker route, new props passed to `<ProjectPicker>` at its render call site (~line 814).
- `src/components/ProjectPicker.tsx` — new props in `ProjectPickerProps`, new "Also in Google Drive" section markup between `project-list-section` and `create-project-section`.
- `src/components/ProjectPicker.css` — new classes for the new section (read file first, match existing naming).
- `src/__tests__/ProjectPicker.test.tsx` — new or extended test file.
- `src/__tests__/App.test.tsx` (or nearest equivalent — confirm exact filename in a task) — discovery-effect coverage.
- `design.md` — "Multi-project architecture" and/or "Google Drive sync design" sections, new subsection.
- `product-behavior.md` — "Project picker (`#/`)" section, new bullet(s).

## Tasks

### T0 — Create git worktree
**Deps:** none
**Files:** none (git only)
**Do:** `git worktree add ../worktree-project-picker-drive-discovery -b project-picker-drive-discovery/main`, cd into it. All following tasks happen inside this worktree.
**Test cases:** n/a
**Acceptance:** worktree exists, branch checked out, cwd is the worktree.

### T1 — Read existing test-mocking patterns for drive-sync
**Deps:** T0
**Files:** `src/__tests__/drive.test.ts`, `src/__tests__/projectRegistry.test.ts`, `src/__tests__/entriesRepo.test.ts` (read only, no edits)
**Do:** Read all three in full. Note exactly how `drive.test.ts` mocks `createDriveSync`/`@open-webapp/drive-sync` and pins the `folderPath` array (`['Notes Diary']`), and how `fake-indexeddb` is set up for registry/entries tests. Write down (in scratch notes, not committed) the mock shape needed later for `getConnection`/`files.list` so T8/T9 don't reinvent it.
**Test cases:** n/a (research task)
**Acceptance:** can state in one sentence how `createDriveSync` is mocked in `drive.test.ts` and confirm the pinned `folderPath` array is never touched by this plan.

### T2 — Read current ProjectPicker.tsx and ProjectPicker.css in full
**Deps:** T0
**Files:** `src/components/ProjectPicker.tsx`, `src/components/ProjectPicker.css` (read only)
**Do:** Read both files completely (not just the excerpt already known). Confirm exact current props interface, `handleDeleteProject`'s error-handling pattern (for T8's console.error mirror), and existing CSS class-naming conventions (e.g. `project-list-section`, `.project-list-title`) to reuse for the new section's classes.
**Test cases:** n/a (research task)
**Acceptance:** can list the exact current `ProjectPickerProps` fields and the CSS class-naming convention to follow.

### T3 — Bump @open-webapp/drive-sync to version with modifiedTime [BLOCKED]
**Deps:** T0
**Files:** `package.json`, `package-lock.json`
**Do:** BLOCKED. Do not attempt until: (a) `~/owa/owa/plans/drive-sync-modified-time.md` (or equivalent) exists and has been implemented, (b) a new `@open-webapp/drive-sync` version with `modifiedTime` on `FileRef` is published to npm. Once available: `npm install @open-webapp/drive-sync@<new-version>`, confirm `node_modules/@open-webapp/drive-sync/dist/types.d.ts` now has `modifiedTime` on `FileRef`.
**Test cases:**
- happy: after bump, `FileRef` type includes `modifiedTime: string` (or whatever type the library publishes) and existing `drive.test.ts` suite still passes unmodified.
- edge: if the library ships `modifiedTime` as optional (`modifiedTime?: string`), downstream code (T6) must handle `undefined` gracefully (e.g. omit the "Last updated" line or show a fallback).
- error: if npm install fails or the published type still lacks the field, STOP — do not proceed to T4+, re-flag as still blocked.
**Acceptance:** `package.json` shows new version; `npm ls @open-webapp/drive-sync` shows it installed; existing test suite (`npm test`) still green.

### T4 — Add discovery state + one-shot effect in App.tsx
**Deps:** T3
**Files:** `src/App.tsx`
**Do:** Add `driveDiscoveredFolders: {name: string, modifiedTime: string}[]` and `driveDiscoveryLoading: boolean` state (default `[]` / `false`). Add a `useEffect` gated on the picker route (confirm exact route-shape check via `src/lib/router.ts`/`useHashRoute` — re-verify, don't assume the line numbers from earlier grep since they drift) that runs once per picker-route-entry: set loading true; call `listProjects()`; loop synchronously (early break, not `Promise.all`) calling `drive.project(p.id).getConnection()` until the first `connection !== null && !connection.needsReauth`; if none found or `listProjects()` is empty, set loading false, folders `[]`, return. Otherwise call `ensureProjectFolderId(foundProject.id, foundProject.name, true)`, then `drive.project(foundProject.id).files.list({ folderId, mimeType: 'application/vnd.google-apps.folder' })`. Filter out any folder whose trimmed-lowercased `name` matches any local project's trimmed-lowercased `name` (mirror `projectRegistry.ts` comparison exactly). Map remaining to `{name, modifiedTime}`. Wrap entire body in try/catch; on any throw, `console.error('Drive discovery error:', error)` and set folders to `[]`. Always set loading false in a `finally`.
**Test cases:**
- happy: 2 local projects, first has valid connection, Drive has 3 subfolders where 1 name doesn't match any local project → `driveDiscoveredFolders` has exactly that 1 entry.
- edge: local project names differ only in case/whitespace from a Drive folder name (e.g. " Work " vs "work") → correctly excluded as a local match (case-insensitive trim comparison).
- edge: zero local projects → effect returns immediately, no fetch attempted, loading stays false.
- edge: first project has `connection.needsReauth === true`, second project has valid connection → second project used (short-circuit skips reauth-needed ones).
- error: `files.list` throws → `driveDiscoveredFolders` set to `[]`, loading set to false, `console.error` called, no exception propagates to the component tree.
**Acceptance:** effect runs exactly once per picker-route mount (no re-fetch on unrelated re-renders); state variables update correctly for all five cases above; no unhandled promise rejection in console during tests.

### T5 — Wire new props into ProjectPicker render call site
**Deps:** T4
**Files:** `src/App.tsx`
**Do:** At the `<ProjectPicker ... />` call site (~line 814, re-verify exact line since it drifts), add `driveDiscoveredFolders={driveDiscoveredFolders}` and `driveDiscoveryLoading={driveDiscoveryLoading}` props alongside existing `projects`, `onCreate`, `onDelete`, `onOpen`.
**Test cases:**
- happy: props passed through unchanged reference when state hasn't changed (no unnecessary re-render churn beyond what React does normally).
- edge: props reflect `[]`/`false` defaults before the effect resolves (loading state visible first render).
- error: n/a (prop wiring, no runtime branching).
**Acceptance:** TypeScript compiles (`npm run build` typecheck step passes) with new props required/typed correctly.

### T6 — Add new section markup + props to ProjectPicker.tsx
**Deps:** T2, T5
**Files:** `src/components/ProjectPicker.tsx`
**Do:** Extend `ProjectPickerProps` with `driveDiscoveredFolders: {name: string; modifiedTime: string}[]` and `driveDiscoveryLoading: boolean`. Add a new sibling `<div className="drive-discovery-section">` between `project-list-section` and `create-project-section`: if `driveDiscoveryLoading`, render loading text (e.g. `<p>Checking Google Drive...</p>`); else if `driveDiscoveredFolders.length > 0`, render `<h2>Also in Google Drive</h2>` plus a list of rows, each showing folder name + `Last updated {formatted date}` (reuse existing date-formatting util if one exists in `src/lib/dateUtils.ts` — check before writing a new formatter); else render nothing (whole section absent, not just empty list). No buttons/click handlers on rows.
**Test cases:**
- happy: `driveDiscoveredFolders` has 2 entries → both render with name + formatted "Last updated" date, no interactive elements attached.
- edge: `driveDiscoveryLoading === true` and `driveDiscoveredFolders === []` → only loading text shown, no "Also in Google Drive" heading yet.
- edge: `driveDiscoveryLoading === false` and `driveDiscoveredFolders === []` → section renders nothing at all (verify no empty heading/div left in DOM).
- error: malformed/missing `modifiedTime` on an entry (e.g. `undefined`) → row still renders without crashing (omit date or show fallback text, per T3's edge-case note).
**Acceptance:** component renders correctly for all four states above; no Drive-related imports added to this file (component stays "dumb" per requirement 10); `npm run build` typecheck passes.

### T7 — Add CSS for new section
**Deps:** T6
**Files:** `src/components/ProjectPicker.css`
**Do:** Add classes for `.drive-discovery-section` and its rows, following the existing file's spacing/typography conventions (checked in T2). No new color tokens unless `src/styles/tokens.css` already has something suitable — reuse existing tokens.
**Test cases:**
- happy: new section visually matches spacing/typography of "Your Projects" section (manual visual check, not automated).
- edge: long folder names wrap/truncate sensibly, don't overflow container.
- error: n/a (CSS-only, no error states).
**Acceptance:** `npm run build` succeeds; visual check in `npm run dev` shows the new section styled consistently with the rest of the page.

### T8 — Write/extend ProjectPicker.test.tsx
**Deps:** T6, T7, T1
**Files:** `src/__tests__/ProjectPicker.test.tsx` (create if absent, else extend)
**Do:** Using RTL, cover: section hidden when `driveDiscoveredFolders` is empty and not loading; section shows loading text when `driveDiscoveryLoading` is true; section shows correct name + "Last updated <date>" rows when folders present; no buttons/onClick present on discovered-folder rows (assert no interactive role on those rows).
**Test cases:**
- happy: pass 2 discovered folders as props → both rows render with correct text content.
- edge: pass `driveDiscoveryLoading: true, driveDiscoveredFolders: []` → loading text shown, no rows.
- edge: pass `driveDiscoveryLoading: false, driveDiscoveredFolders: []` → section entirely absent from DOM (query returns null).
- error: n/a at this layer (error handling is App.tsx's concern, covered in T9).
**Acceptance:** `npx vitest run src/__tests__/ProjectPicker.test.tsx` passes, all four cases above present as distinct test cases.

### T9 — App.tsx-level test coverage for discovery effect
**Deps:** T4, T1
**Files:** `src/__tests__/App.test.tsx` (confirm exact existing test filename covering App.tsx — search `src/__tests__/` in this task; create a new file scoped to this feature if none exists, e.g. `src/__tests__/App.driveDiscovery.test.tsx`)
**Do:** Mock `drive.project(...).getConnection` and `.files.list` per the pattern learned in T1. Cover: connection iteration short-circuits on first valid project; a project with `needsReauth: true` is skipped in favor of the next; name-matching filter excludes case/whitespace-variant matches; any thrown error results in empty folders array + no crash + `console.error` called (spy on `console.error`).
**Test cases:**
- happy: 3 local projects, second one connected → discovery runs using the second project's connection, section populates correctly downstream.
- edge: all local projects disconnected or needing reauth → no fetch attempted, `driveDiscoveredFolders` stays `[]`.
- edge: Drive subfolder name matches a local project name after trim/lowercase normalization → excluded from discovered list.
- error: `files.list` rejects → caught, `console.error` called once, `driveDiscoveredFolders` is `[]`, `driveDiscoveryLoading` ends `false`.
**Acceptance:** all four cases pass under `npx vitest run <test-file>`; no unhandled rejections logged during the run.

### T10 — Update design.md
**Deps:** T4, T6
**Files:** `design.md`
**Do:** Add a subsection under "Google Drive sync design" (or "Multi-project architecture", whichever fits better on read) describing: picker-mount discovery flow, the reused helpers (`ensureProjectFolderId(..., true)`, `drive.project(id).files.list`), the connection-iteration short-circuit rule, and the `{name, modifiedTime}[]` data shape held in `App.tsx` state. Keep terse, token-optimized, no narrative prose, current-state-only — per CLAUDE.md doc rules.
**Test cases:** n/a (doc task)
**Acceptance:** new subsection present, consistent in tone/format with rest of file, no narrative prose, accurately reflects the code as implemented (re-check against T4/T6 code after they're done).

### T11 — Update product-behavior.md
**Deps:** T4, T6
**Files:** `product-behavior.md`
**Do:** Under "Project picker (`#/`)" section, add bullet(s) describing: "Also in Google Drive" section appears only when discovered folders exist; shows name + "Last updated <date>" per folder; loading text shown briefly on mount while checking; section is silently absent on any error or if no project has an active Drive connection; no actions on rows. Keep terse, bullet style, current-state-only — per CLAUDE.md doc rules.
**Test cases:** n/a (doc task)
**Acceptance:** new bullets present, matches existing terse bullet style in the file, accurately reflects implemented behavior.

### T12 — Full-file review of design.md and product-behavior.md
**Deps:** T10, T11
**Files:** `design.md`, `product-behavior.md`
**Do:** Per CLAUDE.md's "Full-file review after major changes" rule: re-read both files in full end to end. Check for: inconsistencies between sections, stale/contradicted content (e.g. anything implying picker has no Drive awareness), narrative drift, redundant phrasing. Fix anything found in this task, not deferred.
**Test cases:** n/a (doc review task)
**Acceptance:** both files re-read fully; any found inconsistency or staleness fixed in this same task; files remain terse/token-optimized/current-state-only.

### T13 — Full test suite run
**Deps:** T8, T9, T12
**Files:** none (verification only)
**Do:** Run `npm test` (full suite) and `npm run build` (typecheck + build). Fix any failures caused by this feature's changes.
**Test cases:**
- happy: full suite green, build succeeds.
- edge: pre-existing unrelated failures (if any) are identified as pre-existing, not caused by this change, and noted rather than silently ignored.
- error: any failure caused by this feature's code is fixed before proceeding.
**Acceptance:** `npm test` exits 0; `npm run build` exits 0.

### T14 — Commit
**Deps:** T13
**Files:** none (git only)
**Do:** Stage all changed files (`package.json`, `package-lock.json` if T3 done, `src/App.tsx`, `src/components/ProjectPicker.tsx`, `src/components/ProjectPicker.css`, new/updated test files, `design.md`, `product-behavior.md`). Commit with a descriptive message.
**Test cases:** n/a
**Acceptance:** commit exists, `git status` clean.

### T15 — Cleanup git worktree
**Deps:** T14
**Files:** none (git only)
**Do:** cd back to original directory, `git worktree remove ../worktree-project-picker-drive-discovery`.
**Test cases:** n/a
**Acceptance:** worktree removed, original directory active, branch still exists with the commit.

## Test strategy

Unit-level: `ProjectPicker.test.tsx` covers pure rendering states (loading/populated/empty) via RTL with props injected directly — no Drive mocking needed at this layer. `App`-level test covers the discovery effect's decision logic (connection iteration, short-circuit, name-filter, error handling) with `drive.project(...)` mocked per the existing `drive.test.ts` pattern. Full suite (`npm test`) + typecheck/build (`npm run build`) run at the end as an integration gate. No new IndexedDB-dependent test needed beyond what `listProjects()` already covers in `projectRegistry.test.ts` — this feature only reads via that existing function, doesn't add new persistence.

## Risks

- **Blocked on external library change** (T3): this plan cannot fully land until `@open-webapp/drive-sync` ships `modifiedTime`. Mitigation: T0-T2 (setup/research) can proceed independently; T4+ genuinely wait. Do not attempt workarounds.
- **Route-shape assumptions drift**: line numbers and exact route check in `App.tsx`/`router.ts` were captured at planning time and may have moved. Mitigation: T4 explicitly says to re-verify before writing code.
- **Silent-failure feature could mask real bugs during dev**: hiding all errors means a broken discovery flow looks identical to "no Drive folders found." Mitigation: `console.error` calls are required in every catch path so devtools still show the cause.
- **Connection iteration cost**: looping `getConnection()` across all local projects on every picker visit could be slow with many projects. Mitigation: `getConnection()` is documented as local-only/no-network (per `drive.ts`), so this is cheap; short-circuit on first hit further bounds it.

## Open questions

- The companion library plan `~/owa/owa/plans/drive-sync-modified-time.md` does not exist yet as of this planning session (2026-08-15) — only `_template.md` and `drive-sync-picker.md` are present in `~/owa/owa/plans/`. Someone needs to write, implement, and publish that plan before T3 (and everything after it) can proceed.
- Once the library ships `modifiedTime`, will it be a required or optional field on `FileRef`? T3/T6 need this confirmed to decide whether "Last updated" can ever be omitted for a discovered folder.
- Exact current route-shape check (`route.name === 'picker'` vs something else) needs re-verification in `src/lib/router.ts`/`useHashRoute` at implementation time — not fully nailed down in this plan.
- Exact existing App-level test filename (if any) to extend in T9 is unconfirmed — needs a directory listing check at implementation time.

## Post-change doc updates

- `design.md` — new subsection under "Google Drive sync design" (or "Multi-project architecture") describing the picker-mount discovery flow, reused helpers, and data shape (T10).
- `product-behavior.md` — new bullet(s) under "Project picker (`#/`)" describing the new section's visible/loading/silent-failure behavior (T11).
- Full-file review of both files for consistency/staleness/narrative-drift after all code+doc changes land (T12) — required by CLAUDE.md, not optional.
- No `schema-spec.md` changes — this feature adds no new persisted schema (discovered-folder list is transient in-memory state, not written to IndexedDB or meta store).
