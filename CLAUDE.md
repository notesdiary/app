# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ground Rules

- Plans go in `plans/*.md`, not `.claude/<feature>/`.
- *ALWAYS* update relevant docs (this file, `AGENTS.md`) when changes are made — independent of whether the user explicitly requests it.
- When something is NOT working as expected, *MUST* add a test to reveal the bug and then fix and re-test.
- Do *NOT* create any document unless asked.

## Commands

- `npm run dev` — start Vite dev server on port 5173
- `npm run build` — typecheck (`tsc`) then production build (`vite build`)
- `npm run preview` — preview the production build on port 5173
- `npm test` — run all tests (vitest)
- `npm test -- --watch` — watch mode
- `npx vitest run src/__tests__/entriesRepo.test.ts` — run a single test file
- `./start.sh` — kills anything on :5173, `npm run build`, then `npm run preview` (used for full from-scratch runs)

There is no lint script configured.

## Architecture

Local-first, multi-project React 18 + TypeScript + Vite diary app ("Notes Diary"), installable as a PWA (`vite-plugin-pwa`). Deployed under base path `/app/`. No backend — all data lives in per-project IndexedDB, with optional Google Drive backup.

**Entry point**: `src/main.tsx` → `src/App.tsx`. All app state (projects, entries, drive sync, UI mode) lives in `App.tsx` via plain `useState`/`useEffect` — no reducer/store library.

### Multi-project model

- `src/lib/projectRegistry.ts` owns a top-level `notes-diary-registry` IndexedDB (`projects` store) mapping `Project { id, name, dbName, createdAt }` → each project's own separate entries database (`dbName`).
- `src/lib/db.ts` holds a `Map<dbName, IDBPDatabase>` of open handles plus one "active" `dbName` set via `setActiveProjectDb()`. All of `entriesRepo.ts`/`metaRepo.ts` read/write through the currently active project's DB — always confirm `setActiveProjectDb` has been called (or pass an explicit `dbName`) before assuming which project's data you're touching.
- Legacy single-project installs are migrated automatically: `migrateLegacyDbIfNeeded()` detects the old `notes-diary` IndexedDB and registers it as a project named "My Notes" with `dbName: 'notes-diary'` (never re-seeds once the registry is non-empty). This legacy project is also special-cased in Drive folder resolution (see below).
- Routing is hash-based (`src/lib/router.ts` + `src/hooks/useHashRoute.ts`): `#/` = project picker (`ProjectPicker.tsx`), `#/project/<id>` = the diary shell for that project. `App.tsx` treats `route.name === 'picker'` as an early return that skips the whole app shell.

### Data layer (per project)

- **IndexedDB schema** in `src/lib/db.ts`, version 2: `entries` store (keyPath `id`, `by-date` index) and `meta` store (key-value).
- `src/lib/entriesRepo.ts` — entry CRUD. Saving empty/whitespace text via `updateEntryText` deletes the entry rather than leaving a blank one.
- `src/lib/metaRepo.ts` — Drive connection metadata, filter rules, and per-rule filter sync state, all stored as `meta` keys.

### Tags and filtering

- Tags are derived at render time from entry text, never persisted (`src/lib/tags.ts`, pattern `#[a-zA-Z][\w-]*`), plus a synthetic `__untagged__` pseudo-tag.
- `src/lib/mode.ts` derives the current view mode (day/tag/search) from search query + selected tags; `src/lib/entryFiltering.ts` applies that mode to the entry list.
- A trailing tag-only section makes its tags entry-level for the whole entry, consumed only by `filterParagraphsInEntry` (`src/lib/entryFiltering.ts`) to return all sections instead of the matched subset; derived at render time, never persisted.

### Google Drive sync

Wraps `@open-webapp/drive-sync` (external package handling OAuth token lifecycle, storage, and low-level Drive file/permission ops — see its `SPEC.md` for the 34 resolved design decisions if changing sync behavior; app-side owns merge logic, file naming, and content format).

- `src/lib/drive.ts` creates the app-wide `drive` singleton (`folderPath: ['Notes Diary']`). **`folderPath` is load-bearing and silent-failure-prone**: a wrong value doesn't error, it just creates a fresh empty Drive folder and makes existing backups appear to vanish.
- Per-project folder resolution (`ensureProjectFolderId`) preserves the pre-multi-project layout: the legacy migrated project (`dbName === 'notes-diary'`) uses the top-level "Notes Diary" folder directly; every other project gets its own subfolder named after the project. This creates a short-lived scoped `createDriveSync` instance purely to walk the folder path — it must never call `.activate()` itself since the singleton already owns background token refresh.
- **Filter-mode sync**: users define named `FilterRule`s (text-match filters → backup filenames); a single auto-seeded remainder rule (`isRemainder: true`, default filename `notesdiary-backup.json`) catches everything not matched by another rule. Sync is per-rule (`syncFilterRule`) or all-at-once (`syncAllFilters`/`syncAllNow`, also run on a 5-minute interval while connected).
- Sync algorithm per rule: if the Drive file already has a known `driveFileId`, `files.status()` first checks whether it changed since this client's last read/write (`changedSinceRestore`). Unchanged → local is authoritative, written as-is (so local deletions take effect instead of being resurrected). Changed (or never restored, e.g. first sync or a self-healed file from another device) → union local matches with the remote file's entries by `id`, local wins on collision; downloaded remote-only entries are persisted locally and merged into state. New Drive files are self-healed by name lookup before assuming one needs creating (handles files uploaded from another device).
- `needsReauth` is computed locally from `getConnection()` (no network call) and polled every 60s while connected, to detect scope changes without forcing a reconnect prompt on every load.

### Environment

`VITE_GOOGLE_CLIENT_ID` (Google OAuth client ID) is required for Drive sync; set it in a gitignored `.env.local`. See `.env.example`.

### Mobile responsive

- Breakpoint: `960px`, tracked via `useWindowWidth()`.
- Below 960px, `LeftRail` becomes a fixed drawer with a `Backdrop` overlay; drawers close automatically after navigation actions (`closeDrawersOnMobile`).

### Testing

Vitest + jsdom + React Testing Library, tests in `src/__tests__/`. `fake-indexeddb` is used for IndexedDB-dependent tests (`db.test.ts`, `entriesRepo.test.ts`, `drive.test.ts`, `projectRegistry*.test.ts`). `drive.test.ts` pins the exact `folderPath` array passed to `createDriveSync` — see the load-bearing warning above before changing it.

## Reference Docs

Maintains agent-optimized reference docs in the repo root — canonical source of truth for current behavior and design.

**Files:**

| File | Required | Purpose |
|------|----------|---------|
| `product-behavior.md` | Always | User-visible behavior, edge cases, keyboard interactions, URL state |
| `design.md` | Always | Directory structure, API contract, component tree, state management, data model, data flows, design patterns |
| `schema-spec.md` | When module has a data schema | Data schema format — field reference, examples, validation rules |

**Rules:**

- **Current state only.** Describe the app *as it exists right now*. No history, rationale, or planned features.
- **Token-optimized.** Terse, dense, structured for agent parsing. Bullet lists, tables, compact type definitions. No narrative prose.
- **Auto-update after every change.** When modifying any module, update affected section(s) of its reference docs — regardless of whether the user asks. Do not wait for instruction.
- **Full-file review after major changes.** After MAJOR changes (new features, refactors, schema/API/behavior shifts — not trivial typo/wording fixes), re-read each affected reference doc in full. Verify: no inconsistencies across sections, no stale or contradicted content, accurate to current code, still token-optimized (terse, no redundancy, no drift into narrative). Fix any issues before considering the task done.
- **Auto-create on-demand.** When working on a module that lacks these files, create them. Ask the user for clarifications as needed.
- **No inline maintenance rules.** Files contain pure content. Maintenance rules live here in CLAUDE.md only.
- **Minimal cross-references.** One-line pointer to sibling docs at top of each file. No inline section-to-section references.
- **Supersede plans.** If `plans/*.md` files exist, reference docs are canonical. Plans remain historical artifacts.
