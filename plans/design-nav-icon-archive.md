# Plan: Nav Restructure + App Icon + "Archived" Rename

## Overview

Three changes, taken from the design mock at
`.design/project/Diary App.dc.html`, and nothing else in that mock is in
scope (composer styling, entry-row styling, settings/share-modal visuals
are untouched):

1. **App icon.** Replace the placeholder "N" logo (both the in-app rail
   header and the PWA/favicon PNGs) with the mock's helmet-header SVG
   (navy rounded square + notebook-with-lines-and-dots glyph).
2. **Nav restructure.** Delete date-based browsing entirely. Merge
   `LeftRail` (logo/header) and `RightRail` (tag list) into one rail,
   toggled by a single hamburger button that now works the same on
   mobile and desktop. `ViewMode` drops `'day'` in favor of `'all'`
   (all active entries, newest first, each entry always showing its
   date label). New entries are always dated "today".
3. **"Archive" → "Archived".** Nav button label (via `aria-label`/
   `title`, since it becomes icon-only), `ArchiveView`'s `<h1>`, plus a
   live count badge on the nav button.

Design reference: `.design/project/Diary App.dc.html` (prototype only —
inline-styled fake JSX (`sc-if`/`sc-for`), not shipped as-is). Colors,
spacing, copy, and the icon SVG are pulled from it; everything is
re-implemented using this repo's existing pattern (plain `.tsx` +
sibling `.css` file, see `LeftRail.tsx`/`LeftRail.css`).

## Resolved Decisions (baked in, not open questions)

1. **Rail merge:** `LeftRail.tsx` becomes the single rail (keeps the
   file name). `RightRail.tsx` and `RightRail.css` are deleted; their
   tag-list rendering logic and styling move into `LeftRail.tsx`/
   `LeftRail.css`. `App.tsx` renders exactly one `<LeftRail>` (no more
   separate desktop/mobile `<RightRail>` renders).
2. **Toggle:** One hamburger button, in `DiaryHeader.tsx`, always
   rendered (not gated by `isMobile` anymore). It toggles the single
   `leftOpen` state. `rightOpen` state, `onTagButtonClick`/
   `handleTagButtonClick`, and the header's `tag-button` are deleted.
3. **Drawer default:** `leftOpen` defaults to `true` on both mobile and
   desktop on load. The `useEffect` in `App.tsx` (lines 91-96) that
   forces `leftOpen`/`rightOpen` to `true` on the mobile→desktop
   transition is deleted — no longer needed since the default is now
   always `true` regardless of viewport, and the user's manual toggle
   should persist across a resize instead of being overridden.
4. **Backdrop:** stays mobile-only. `showBackdrop = isMobile && leftOpen`
   (was `isMobile && (leftOpen || rightOpen)`). Desktop never shows a
   scrim — collapsing a persistent rail on a wide screen doesn't need
   one, and the mock's `leftOpen` state (which drives `showBackdrop`
   itself) defaults to `false` only because the mock only ever runs
   mobile-width demos; that default doesn't apply here since we're
   explicitly defaulting the rail open on both breakpoints.
5. **`ViewMode`:** `'day' | 'tag' | 'search'` becomes `'all' | 'tag' |
   'search'`. `'all'` is the new no-filter default and returns every
   active entry, sorted newest-first (existing date-desc/time-desc sort
   in `filterEntries` is reused unchanged, just the branch condition
   renames). `filterEntries`'s `selectedDate` parameter is dropped
   entirely (dead once `'day'` mode is gone) — call sites updated.
6. **Per-entry date labels:** `EntryRow.tsx`'s
   `{props.mode !== 'day' && <div className="entry-date">{md}</div>}`
   becomes an unconditional render (drop the mode check) — in `'all'`
   mode entries now always show their date, matching the mock's
   `item.showDate` always being `true`. The `mode` prop stays on
   `EntryRowProps`/`EntryListProps` (still needed by
   `filterParagraphsInEntry` for tag/search paragraph filtering) — only
   the date-label conditional changes.
7. **Composer placement:** `DiaryView.tsx`'s `{props.mode === 'day' &&
   <Composer .../>}` becomes `{props.mode === 'all' && ...}` — same
   behavior (composer only shows with no filter active), renamed
   condition only.
8. **New entry dates:** `App.tsx`'s `handleComposerBlur` calls
   `createEntry(getTodayISO(), timeStr, trimmed)` instead of
   `createEntry(selectedDate, ...)`. `selectedDate` state,
   `handleSelectDate`, `extraDates` state, `handleAddExtraDate`, and the
   dead `showDatePicker` state (declared at `App.tsx:51`, already
   unused outside `LeftRail`'s own local date-picker UI which is also
   being deleted) are all removed from `App.tsx`.
9. **`metaRepo.ts` cleanup:** `getExtraDates`/`addExtraDate` are deleted
   — grep confirms they're only referenced from `App.tsx` and
   `LeftRail.tsx`, both of which stop using them. `metaRepo.test.ts` has
   no tests for these two functions today, so no test deletions needed
   there.
10. **Icon rasterization tool:** no new dependency — extend the
    existing `generate-icons-simple.js` script in place. `package.json`
    currently has zero image/rasterization tooling in devDependencies
    (confirmed — no `sharp`, `canvas`, `puppeteer`, `playwright`, or
    `resvg`, only test/build tooling), and this plan keeps it that way.
    `generate-icons-simple.js` already builds PNGs via a manual RGB
    pixel buffer + Node's built-in `zlib` deflate (no external
    dependency) — it currently only draws a flat circle placeholder,
    but the same per-pixel approach can faithfully rasterize the mock's
    icon (rounded-square navy background, 5 stroked circles, 3 stroked
    line-segment bars) with pure math, no native binary required:
    - **Background:** for each target size, a point-in-rounded-rect
      test (scale the `8/30` corner-radius ratio and full square extent
      from the source SVG proportions to the target pixel size) fills
      navy (`#081A59`) inside, leaves transparent/background outside.
    - **The 5 rings:** each is a stroke, not a fill — for each pixel,
      compute distance from the circle's center (scaled proportionally
      from the source `viewBox="0 0 17 17"` coordinates, e.g.
      `cx=2.4, cy=3.4/6.2/9/11.8/14.6, r=1, stroke-width=1`) and paint
      cyan (`#D9FAFF`) only when that distance falls within the thin
      band `[r - strokeWidth/2, r + strokeWidth/2]` (scaled), leaving
      the ring's interior untouched.
    - **The 3 bars:** each is a line segment (`M7 5H12.5`, `M7 8H12.5`,
      `M7 11H10.5` in source viewBox coordinates, stroke `#081A59`,
      `stroke-width: 1`, round cap) — for each pixel, compute
      distance-to-segment and paint navy when that distance is within
      `strokeWidth/2` (scaled), producing a thickened line.
    - **Scaling:** all source coordinates are proportionally scaled
      from the source SVG's `viewBox` (the inner `17×17` glyph nested
      in the outer `30×30` navy square) to each target pixel size
      (192, 512, 512-maskable, 180 apple-touch) before running the
      per-pixel tests above.
    `generate-icons.js` (the earlier abandoned attempt) is deleted, but
    `generate-icons-simple.js` is kept and extended in place (not
    renamed, not replaced) since it already has the working PNG-encoder
    scaffolding this approach builds on. No new `package.json`
    dependency is added for this.
11. **Maskable icon padding:** the 512-maskable variant keeps the full
    navy square edge-to-edge (no rounded corners baked in, since OS
    masks apply their own shape) and scales the inner glyph down to fit
    within the standard ~80% "safe zone" so it isn't clipped by a
    circular mask. The 192/512/apple-touch variants use the mock's
    actual proportions (11/17 width ratio glyph, 8/30 corner radius
    ratio, i.e. rounded square, not full-bleed).
12. **`countArchivedEntries()`:** implemented in `entriesRepo.ts` via an
    `IDBCursor` walk over the `entries` store (not `db.getAll()` then
    `.filter().length`, and not the existing `by-archived` index).
    Reason: IndexedDB's structured-clone key spec does not accept
    `boolean` as a valid index key, so records with `archived: true`
    are silently *excluded* from the `by-archived` index rather than
    throwing — `db.count('entries', 'by-archived', ...)` would likely
    always return `0`. A cursor walk counts correctly without ever
    materializing all entry bodies into one JS array at once (unlike
    `listAllArchivedEntries()`, which is what `App.tsx`'s top-level
    `entries` state deliberately avoids loading).
12a. **Delete the dead `by-archived` index:** since Task 6 is already
    touching this exact area of `db.ts`/`entriesRepo.ts`, the confirmed
    -dead `entriesStore.createIndex('by-archived', 'archived')` call
    (`db.ts` line 20) is removed as part of the same task rather than
    left as a follow-up. It's dead for two independent reasons: (a) as
    above, `boolean` isn't a valid IndexedDB key type, so the index is
    permanently empty; (b) nothing queries it anyway —
    `entriesRepo.ts`'s `listAllEntries`/`listAllArchivedEntries` both
    do `db.getAll('entries')` and filter in JS. Deleting an index from
    an *already-created* store requires bumping `openDB`'s version
    number (currently `1`) to `2` and handling the deletion inside
    `upgrade()`, because IndexedDB only re-runs `upgrade()` logic when
    the version number increases, and because the current `upgrade()`
    only creates stores/indexes inside
    `if (!db.objectStoreNames.contains('entries'))` — a guard that
    only fires for brand-new databases and therefore never re-runs for
    any existing user who already has the `entries` store. So: (1)
    bump `openDB('notes-diary', 1, {...})` to
    `openDB('notes-diary', 2, {...})`; (2) remove the
    `entriesStore.createIndex('by-archived', 'archived')` line from
    inside the `contains('entries')` guard (new databases created at
    version 2 never get the index at all); (3) add a second block
    *outside* that guard, gated on `oldVersion`, that deletes the index
    for existing users' already-created stores — using the `upgrade`
    callback's `transaction` parameter to reach the existing store
    (`db.createObjectStore`/`contains` alone can't delete an index on
    a store that already exists): e.g.
    `if (oldVersion < 2) { const store = transaction.objectStore('entries'); if (store.indexNames.contains('by-archived')) { store.deleteIndex('by-archived'); } }`.
    The `indexNames.contains` check makes this safe to run
    unconditionally on every version-1-to-2 upgrade regardless of
    whether the index happens to exist.
13. **Archived-count refresh strategy:** `App.tsx` calls
    `countArchivedEntries()` once on mount, increments the count
    optimistically by 1 right after a successful `archiveEntry()` call
    in `handleEntryRemove`, and re-fetches the count when the user
    navigates back from `ArchiveView` to the diary (i.e. in the
    `onBackClick` handler passed to `<ArchiveView>`). This covers
    restore/delete-forever, which `ArchiveView` still owns and performs
    locally — no new prop into `ArchiveView` needed, since a refetch on
    "back to diary" is simpler than plumbing a callback through every
    restore/delete action and is always correct by the time the count
    is visible again (the badge only shows on the diary nav rail,
    which isn't visible while `ArchiveView` is open).
14. **Archived badge at 0:** hidden entirely (no badge rendered) when
    the count is `0`, rather than showing a "0" bubble.
15. **Footer icon row:** `LeftRail.tsx`'s footer renders, top to bottom:
    (a) one horizontal row containing two icon-only buttons — Archived
    (box icon, mock line 55, with the count badge) then Settings (gear
    icon, mock line 61) — then (b) the existing full-width text-only
    "About" row, unchanged in behavior/content. This preserves the
    original Archive-then-Settings-then-About top-to-bottom order while
    satisfying "icon-only row, About untouched."
16. **Icon-only buttons accessibility:** each gets `aria-label` and
    `title` ("Archived", "Settings") since there's no visible text.
17. **Tag-list logic ported as-is:** `RightRail.tsx`'s tag-counting,
    sorting (count desc, then alpha), and "Untagged" pseudo-tag logic
    move into `LeftRail.tsx` verbatim (still using
    `splitParts`/`splitSections` from `lib/tags`) — no behavior change,
    just relocated. Selected-tag pill styling (navy bg / white text)
    is ported from `RightRail.css` into `LeftRail.css` as-is.
18. **`LeftRail` props:** drops `selectedDate`, `onSelectDate`,
    `onAddExtraDate`, `extraDates`; gains `selectedTags: string[]`,
    `onTagClick: (tag: string) => void`, `archivedCount: number`. Keeps
    `entries`, `onSettingsClick`, `onArchiveClick`, `onAboutClick`,
    `isMobile`, `isOpen`. `entries` now doubles as the tag-counting
    source (previously `RightRail`'s job).

## Task List

Tasks are ordered; each is a self-contained diff, aim ≤30 min.

### 1. `src/lib/mode.ts` — rename `'day'` to `'all'`
Change `ViewMode = 'day' | 'tag' | 'search'` to
`'all' | 'tag' | 'search'`; change `deriveMode`'s final `return 'day'`
to `return 'all'`. No dependencies.

**Test cases** (update `src/__tests__/mode.test.ts`): rename all
`'day'` expectations to `'all'` (e.g. "returns day mode when no filters
are active" → asserts `'all'`, keep same input/logic, just the returned
literal changes). No new cases needed — behavior is identical, only the
label changed.

**Acceptance criteria:** `npm test -- mode` green; `ViewMode` type has
no `'day'` member anywhere.

### 2. `src/lib/entryFiltering.ts` — rename `'day'` branch to `'all'`, drop `selectedDate` param
In `filterEntries`, remove the `selectedDate: string` parameter; change
`if (mode === 'day') { filtered = entries.filter(e => e.date ===
selectedDate); }` to `if (mode === 'all') { filtered = entries; }` (i.e.
no filtering — just keep the existing sort). In
`filterParagraphsInEntry`, rename the `if (mode === 'day') return
sections;` branch condition to `if (mode === 'all') return sections;`
(same behavior, all paragraphs shown, just renamed).
Depends on: Task 1 (`ViewMode` type).

**Test cases** (update `src/__tests__/entryFiltering.test.ts`): change
`filterEntries(mockEntries, 'day', '2024-01-15', [], '')` calls to
`filterEntries(mockEntries, 'all', [], '')` (4-arg signature now) and
assert it returns **all 4** mock entries (not just the 2 matching
`2024-01-15`) sorted date-desc/time-desc — this is a real behavior
change from the old "day" test, not just a rename, since `'all'` no
longer filters by date. Same signature update for
`filterParagraphsInEntry(entry, 'all', [], '')`, asserting all 3
paragraphs still returned (behavior unchanged there).

**Acceptance criteria:** `npm test -- entryFiltering` green; `'all'`
mode returns every entry passed in, unfiltered, correctly sorted;
`selectedDate` no longer appears in `filterEntries`'s signature.

### 3. `src/components/EntryRow.tsx` + `src/components/DiaryView.tsx` — always show date, rename composer condition
In `EntryRow.tsx`, change
`{props.mode !== 'day' && <div className="entry-date">{md}</div>}` to
an unconditional `<div className="entry-date">{md}</div>` (always
render). In `DiaryView.tsx`, change `{props.mode === 'day' && <Composer
.../>}` to `{props.mode === 'all' && <Composer .../>}`.
Depends on: Task 1.

**Test cases:** manual verification only (no existing `EntryRow`/
`DiaryView` unit test file to extend) — run the app (`/run` skill or
`npm run dev`), confirm: (a) with no tag/search filter active, every
entry in the "All entries" feed shows its date label next to the time,
not just when a tag/search filter is active; (b) the composer textarea
still only appears with no tag/search filter active.

**Acceptance criteria:** `npm run build` type-checks clean (no leftover
`'day'` reference in either file); entries always show a date label
regardless of mode.

### 4. `src/App.tsx` — new entries always dated today, drop date-browsing state
Remove: `selectedDate` state (and its `getTodayISO()` initializer),
`handleSelectDate`, `extraDates` state, `handleAddExtraDate`,
`showDatePicker` state (dead code at current line 51 — confirmed
unused elsewhere in `App.tsx`), and the `getExtraDates`/`addExtraDate`
loading calls in the mount `useEffect` (current lines 65-66). In
`handleComposerBlur`, change `createEntry(selectedDate, timeStr,
trimmed)` to `createEntry(getTodayISO(), timeStr, trimmed)`. Update the
`filterEntries(entries, mode, selectedDate, selectedTags, searchQuery)`
call to `filterEntries(entries, mode, selectedTags, searchQuery)` (per
Task 2's new signature). Remove the now-unused
`getExtraDates, addExtraDate` import from `./lib/metaRepo`.
Depends on: Tasks 1, 2.

**Test cases:** manual verification — create a new entry while some
tag filter is active (so "today" isn't otherwise visible), switch back
to "All entries," confirm the new entry's date label shows today's
date. `npm run build` must type-check clean (no references to deleted
`selectedDate`/`extraDates`/`showDatePicker`).

**Acceptance criteria:** no `selectedDate`, `extraDates`, or
`showDatePicker` symbols remain in `App.tsx`; new entries are always
dated `getTodayISO()`.

### 5. `src/lib/metaRepo.ts` — delete `getExtraDates`/`addExtraDate`
Remove the `EXTRA_DATES_KEY` constant and both functions. Confirmed via
grep that only `App.tsx` (removed in Task 4) and `LeftRail.tsx`
(rewritten in Task 8) reference them, and `metaRepo.test.ts` has no
tests for them.
Depends on: Task 4 (App.tsx must stop importing them first, or this
and Task 4 land together — order between the two doesn't matter as
long as both are in the same change).

**Test cases:** `npm test -- metaRepo` still green (existing tests for
`getFilterRules`/`setFilterRules`/`getDriveMeta`/`setDriveMeta`/
`getFilterSyncState`/`setFilterSyncState` untouched, no test relies on
the deleted functions).

**Acceptance criteria:** `getExtraDates`/`addExtraDate` no longer exist
anywhere in `src/`; `npm run build` clean.

### 6. `src/lib/entriesRepo.ts` — add `countArchivedEntries()`; `src/lib/db.ts` — delete the dead `by-archived` index
In `entriesRepo.ts`, add:
```ts
export async function countArchivedEntries(): Promise<number> {
  const db = await getDB();
  let count = 0;
  let cursor = await db.transaction('entries').store.openCursor();
  while (cursor) {
    if (cursor.value.archived) count++;
    cursor = await cursor.continue();
  }
  return count;
}
```
Per resolved decision 12 — the `by-archived` index can't be trusted
for boolean keys, so this walks a cursor instead of `getAll()` +
filter, or the index.

In `db.ts`, per resolved decision 12a, delete the dead
`entriesStore.createIndex('by-archived', 'archived')` call (currently
line 20) and make the deletion actually take effect for existing
users' already-created IndexedDB stores:
- Bump the version argument in `openDB('notes-diary', 1, {...})` to
  `openDB('notes-diary', 2, {...})` — required because IndexedDB only
  re-runs `upgrade()` when the version number increases; without a
  bump, existing users' browsers never see this change at all.
- Remove the `entriesStore.createIndex('by-archived', 'archived')`
  line from inside the existing
  `if (!db.objectStoreNames.contains('entries'))` block (this block
  only guards brand-new databases, so this alone is sufficient for
  new users — they simply never get the index).
- Add a second block, gated on `oldVersion` and placed *outside* the
  `contains('entries')` guard (that guard never fires for a user who
  already has the store, so the deletion must not depend on it),
  using the `upgrade(db, oldVersion, newVersion, transaction)`
  callback's `transaction` parameter to reach the pre-existing store
  (you cannot delete an index on a store that already exists via
  `createObjectStore`/`contains` alone):
  ```ts
  if (oldVersion < 2) {
    const store = transaction.objectStore('entries');
    if (store.indexNames.contains('by-archived')) {
      store.deleteIndex('by-archived');
    }
  }
  ```
  The `indexNames.contains` check makes this safe to run
  unconditionally for every upgrade from version 1, whether or not the
  index happens to exist on that user's database.
Depends on: none.

**Test cases** (add to `src/__tests__/entriesRepo.test.ts`, same
`fake-indexeddb` setup as existing tests): create 5 entries, archive 2
of them, assert `countArchivedEntries()` returns `2`; with zero entries
in the store, assert it returns `0`; after `restoreEntry` on one of the
2 archived, assert it returns `1`. If a `db.test.ts`/similar exists,
add or update a case confirming the `entries` store's `indexNames`
no longer contains `by-archived` after `initDB()` runs against a
pre-existing (version-1-shaped) database; otherwise manual
verification suffices (open devtools Application tab against a
pre-existing local DB, confirm the `by-archived` index is gone from
the `entries` store after reload, and `by-date` is still present).

**Acceptance criteria:** `npm test -- entriesRepo` green including the
3 new cases; `countArchivedEntries()` counts correctly without calling
`listAllArchivedEntries()` or `db.getAll()` internally; `db.ts` opens
at version `2`; `by-archived` no longer exists anywhere in `db.ts`'s
store-creation code, and is actually removed (via `deleteIndex` in the
`oldVersion < 2` branch) from existing users' already-created
`entries` store, not just omitted for new databases.

### 7. `src/App.tsx` — wire archived count state
Add `const [archivedCount, setArchivedCount] = useState(0);`. In the
mount `useEffect`, add
`setArchivedCount(await countArchivedEntries());` alongside the
existing entries load. In `handleEntryRemove`, after a successful
`archiveEntry(id)`, add `setArchivedCount(c => c + 1);`. Change the
`view === 'archive'` render to pass a wrapped back-handler:
`onBackClick={async () => { setView('diary');
setArchivedCount(await countArchivedEntries()); }}` instead of the
current inline `() => setView('diary')`. Import
`countArchivedEntries` from `./lib/entriesRepo`.
Depends on: Task 6.

**Test cases:** manual verification — archive an entry, confirm the
(not-yet-rendered, lands in Task 9) count value would increment
(can verify via React DevTools or a temporary console.log during dev);
open Archived, restore one entry, go back to diary, confirm the count
reflects the restore. Defer full visual confirmation to Task 9/10 once
the badge renders.

**Acceptance criteria:** `archivedCount` state exists in `App.tsx`,
updates on mount, after archiving, and after returning from
`ArchiveView`; `npm run build` clean.

### 8. `src/components/LeftRail.tsx` — merge in tag-list rendering, drop date-picker
Rewrite `LeftRailProps` to: `entries: Entry[]`, `selectedTags:
string[]`, `onTagClick: (tag: string) => void`, `archivedCount: number`,
`onSettingsClick`, `onArchiveClick`, `onAboutClick`, `isMobile`,
`isOpen` (drop `selectedDate`, `onSelectDate`, `onAddExtraDate`,
`extraDates`). Remove the `showDatePicker` local state, the
"Entries by date" section, and the date-picker `<input type="date">`
block entirely. Port `RightRail.tsx`'s tag-counting/sorting/
"Untagged"-pseudo-tag logic in verbatim (same `splitParts`/
`splitSections` calls, same sort: count desc then alpha), rendering it
where "Entries by date" used to be, under a "Browse by tag" section
header (copy from mock line 43). Keep the existing header (logo +
"Notes Diary" title) — icon SVG swap happens in Task 11. Footer stays
text-only for now (icon-only conversion is Task 9).
Depends on: none of the other tasks strictly, but do after Task 7 so
`archivedCount` prop has a source when wired in Task 10.

**Test cases:** manual verification — with `isMobile=false`, confirm
tag pills render with correct counts and the "Untagged" pill appears
only when untagged entries exist; click a tag pill, confirm
`onTagClick` fires with the right tag string; confirm no date-picker
"+" button or date list remains anywhere in the rail.

**Acceptance criteria:** `LeftRail.tsx` compiles with the new prop
shape; no reference to `selectedDate`/`onSelectDate`/
`onAddExtraDate`/`extraDates`/`showDatePicker` remains in the file;
tag pills render identically to the old `RightRail` (same sort order,
same "Untagged" placement, same selected-state styling once Task 12
ports the CSS).

### 9. `src/components/LeftRail.tsx` — icon-only Archived + Settings row, badge
Replace the current three stacked `nav-button` rows with: one
`.nav-icon-row` div containing two icon-only buttons — Archived
(`aria-label="Archived"`, `title="Archived"`, box/folder SVG from mock
line 55, `onClick={props.onArchiveClick}`) then Settings
(`aria-label="Settings"`, `title="Settings"`, gear SVG from mock line
61, `onClick={props.onSettingsClick}`) — followed by the unchanged
full-width `.nav-button` "About" row (`onClick={props.onAboutClick}`,
still visible text "About"). On the Archived button, render a small
badge span (e.g. `.nav-badge`) showing `props.archivedCount`,
conditionally rendered only when `props.archivedCount > 0` (resolved
decision 14 — hide entirely at 0, no "0" bubble), absolutely positioned
in the button's corner.
Depends on: Task 8 (needs the rewritten footer section to exist first).

**Test cases:** manual verification — with `archivedCount={0}` passed
as a prop in a quick local render, confirm no badge renders; with
`archivedCount={3}`, confirm a badge showing "3" renders on the
Archived button's corner; confirm both icon buttons have correct
`aria-label`/`title` and no visible text; confirm About row is
unchanged (still full-width, still text "About").

**Acceptance criteria:** Archived and Settings render as two icon-only
buttons in one row with correct `aria-label`/`title`; badge shows the
count when `>0` and is entirely absent (no empty bubble) when `0`;
About row untouched in markup/behavior; overall footer order is icon
row then About row (top to bottom), matching resolved decision 15.

### 10. `src/App.tsx` — pass new `LeftRail` props, delete `RightRail` renders
Update the single `<LeftRail>` render to pass `selectedTags`,
`onTagClick={handleTagClick}`, `archivedCount` (from Task 7's state),
and drop the removed props (`selectedDate`, `onSelectDate`,
`onAddExtraDate`, `extraDates`). Delete both `<RightRail>` render
blocks (desktop-always-open and mobile-drawer variants, current lines
723-741) and the `import { RightRail } from
'./components/RightRail';` line.
Depends on: Tasks 4, 7, 8, 9.

**Test cases:** manual verification (or extend
`src/__tests__/App.test.tsx`/`App.viewSwitch.test.tsx` if they already
render `<App>` and query for rail content) — confirm tag pills appear
in the single left rail on both a wide and a narrow viewport; confirm
there is exactly one rail element in the DOM (no leftover second tag
rail).

**Acceptance criteria:** `RightRail` import and both render call sites
are gone from `App.tsx`; single `<LeftRail>` shows both nav footer and
tag list; `npm run build` clean.

### 11. Delete `src/components/RightRail.tsx` and `src/components/RightRail.css`
Straight deletion — logic and styles were ported into `LeftRail.tsx`/
`LeftRail.css` in Tasks 8/12.
Depends on: Task 10 (nothing may still import `RightRail`).

**Test cases:** `grep -r "RightRail" src/` returns no matches; `npm
run build` clean (no dangling import anywhere, including any test
files — grep those too).

**Acceptance criteria:** both files deleted; no reference to
`RightRail` anywhere in `src/`.

### 12. `src/components/LeftRail.css` — port tag-list + footer icon-row styles
Add (from `RightRail.css`, unmodified values): `.tag-browser`,
`.no-tags`, `.tag-item` (+ `.selected`, `.untagged`, `.untagged
.selected`), `.tag-name`, `.tag-count` (+ `.selected .tag-count`), plus
their dark-mode block — same selectors, just now living in
`LeftRail.css` instead of `RightRail.css`. Remove the now-dead
`.entries-by-date-section`, `.section-header`, `.add-date-button`,
`.date-picker-wrapper`, `.date-list`, `.date-item`, `.date-content`,
`.date-text`, `.today-badge`, `.entry-count` rules (light + dark) —
the date-picker/date-list markup is gone as of Task 8. Add new
`.nav-icon-row` (flex row, gap, e.g. `8px`), `.nav-icon-button`
(square ~36px icon button, border `1px solid #DDE0EC`-equivalent to
match this file's existing token style, `border-radius: 8px`,
`position: relative` for badge positioning), and `.nav-badge` (small
absolute-positioned circle/pill, e.g. `background: #FF8200` or the
existing `#00a9ce` accent, white text, `font-size: 10px`, positioned
top-right corner of the button, `border-radius: 999px`, small
`min-width`/padding so 1-2 digit counts fit).
Depends on: Tasks 8, 9 (class names must exist in the `.tsx` before
styling them meaningfully, though CSS can technically land in
parallel).

**Test cases:** manual visual check via `/run` — tag pills look
identical to the pre-merge `RightRail` (colors, spacing, selected
state); Archived/Settings icon buttons are square, evenly spaced, with
the badge visible in light and dark mode without white-on-white or
black-on-black text.

**Acceptance criteria:** no visual regression vs. current tag-pill
styling; new icon-row/badge styles present in both light and dark
blocks; dead date-picker/date-list CSS fully removed.

### 13. `src/components/DiaryHeader.tsx` + `.css` — single always-on hamburger, drop tag button
Remove `onTagButtonClick` from `DiaryHeaderProps` and its button
(`className="tag-button"`, the `#` glyph). Remove the `isMobile &&`
gate around the hamburger button — it now always renders. Drop the
now-unused `isMobile` prop from `DiaryHeaderProps` entirely (nothing
else in the component uses it). In `DiaryHeader.css`, delete the
`.tag-button` rule and its `@media (max-width: 959px) { .tag-button {
display: block; } }` block; delete the `@media (max-width: 959px) {
.hamburger-button { display: block; } }` override and instead give
`.hamburger-button` a permanent `display: flex` (or whatever matches
this file's existing button style) since it's no longer mobile-only.
Depends on: none directly, but pairs with Task 14 which updates the
prop's call site.

**Test cases:** manual verification — on a desktop-width viewport,
confirm the hamburger button is now visible (previously hidden); on
mobile, confirm it still works; confirm no `#`/tag button renders
anywhere in the header at any width.

**Acceptance criteria:** hamburger renders unconditionally regardless
of `isMobile`; `onTagButtonClick` and the tag button are fully removed
from `DiaryHeader.tsx`/`.css`; `npm run build` clean (no leftover
references to the deleted prop).

### 14. `src/components/DiaryView.tsx` + `src/App.tsx` — drop `onTagButtonClick` plumbing
In `DiaryView.tsx`, remove `onTagButtonClick` from `DiaryViewProps` and
its pass-through to `<DiaryHeader>`. In `App.tsx`, remove
`handleTagButtonClick`, the `rightOpen` state itself, and stop passing
`onTagButtonClick={handleTagButtonClick}` to `<DiaryView>`. Update
`handleHamburgerClick` to simply `setLeftOpen(!leftOpen)` (drop the
`if (rightOpen) setRightOpen(false)` branch, since `rightOpen` no
longer exists). Update `closeDrawersOnMobile`/`closeAllDrawers` to only
touch `leftOpen` (drop all `setRightOpen(...)` calls). Update
`showBackdrop` to `isMobile && leftOpen` (resolved decision 4). Change
`leftOpen`'s initializer from `useState(!isMobile)` to `useState(true)`
(resolved decision 3) and delete the mobile/desktop-transition
`useEffect` (current lines 91-96) that reset both to `true`.
Depends on: Task 13 (prop removed from `DiaryHeader` first, so this
task's `DiaryView`/`App.tsx` changes compile cleanly together).

**Test cases:** manual verification — load the app fresh on both a
desktop-width and mobile-width viewport, confirm the rail is open by
default in both; click the hamburger to close it on desktop, confirm
it stays closed (no effect forces it back open); resize from mobile to
desktop mid-session with the rail manually closed, confirm it stays
closed (no forced reopen).

**Acceptance criteria:** `rightOpen` state, `handleTagButtonClick`, and
all `setRightOpen` calls are gone from `App.tsx`; `leftOpen` defaults
to `true` on both viewport types; the forced-reopen `useEffect` is
deleted; `npm run build` clean.

### 15. `src/App.css` — remove dead `.right-rail` selector
Delete `.right-rail` from the `@media (max-width: 959px) { .left-rail,
.right-rail { position: fixed; } }` rule, leaving just `.left-rail`.
Depends on: Task 11 (RightRail.tsx/css fully gone).

**Test cases:** manual visual check — mobile drawer still slides in
correctly (this rule only affected `.right-rail`'s now-deleted
positioning duplicate; `.left-rail`'s own `position: fixed` is already
set directly in `LeftRail.css`, so removing the redundant `.right-rail`
half of this selector has no visible effect).

**Acceptance criteria:** no `.right-rail` selector remains in
`App.css`.

### 16. `src/components/ArchiveView.tsx` — rename heading to "Archived"
Change `<h1 className="archive-title">Archive</h1>` to `<h1
className="archive-title">Archived</h1>`. No other changes — subtitle
copy, grouping, restore/delete-forever behavior all stay as-is.
No dependencies.

**Test cases:** if `src/__tests__/ArchiveView.test.tsx` asserts on the
heading text, update that assertion from `"Archive"` to `"Archived"`;
otherwise add one assertion confirming the rendered `<h1>` text is
exactly `"Archived"`.

**Acceptance criteria:** `npm test -- ArchiveView` green; heading reads
"Archived", not "Archive".

### 17. Extract the mock's SVG icon into a shared `AppIcon` component
Create `src/components/AppIcon.tsx` exporting a small
`AppIcon({ size = 30 }: { size?: number })` component that renders the
mock's exact markup (mock lines 29-38): a `size`×`size` navy
(`#081A59`) rounded-square (`border-radius` scaled proportionally to
the mock's `8/30` ratio) flex-centered around the inner 17×17-viewBox
SVG (rounded rect `#D9FAFF` fill, 5 stroked circles, 3 navy stroked
lines) — same shapes/colors, scaled via the `viewBox` so it stays crisp
at any `size`. This is a plain component, not a `.css` file (mirrors
how e.g. `EntryContent.tsx` inlines small bits of markup) since it's
pure SVG with no interactive states.
No dependencies.

**Test cases:** manual verification — render `<AppIcon size={30}/>` and
`<AppIcon size={48}/>` side by side, confirm both look like scaled
versions of the same glyph (rounded square proportions, circle/line
positions) with no distortion.

**Acceptance criteria:** component compiles, renders the navy square +
inner glyph at the given `size`, matches the mock's colors exactly
(`#081A59` background, `#D9FAFF` fill/stroke).

### 18. `src/components/LeftRail.tsx` + `.css` — swap "N" logo for `AppIcon`
Replace `<div className="app-logo">N</div>` with `<AppIcon size={30}
/>` (import from `./AppIcon`). Remove the now-unused `.app-logo` rule
from `LeftRail.css` (light + dark blocks).
Depends on: Task 17.

**Test cases:** manual verification — confirm the rail header now
shows the navy-square notebook glyph instead of a plain "N", at the
same 30×30 footprint and position next to "Notes Diary".

**Acceptance criteria:** `.app-logo` CSS rule fully removed; header
renders `<AppIcon>` in its place with no layout shift (same 30px
box, same gap to the title text).

### 19. `generate-icons-simple.js` — extend in place to rasterize the real icon (no new dependency)
Delete `generate-icons.js` (the earlier abandoned attempt) only.
Rewrite `generate-icons-simple.js`'s per-pixel drawing logic (keep its
existing PNG-encoder scaffolding — signature/IHDR/CRC32/zlib-deflate —
unchanged) to replace the flat-circle placeholder with per-pixel math
reproducing the mock's icon (navy rounded-square background, 5 stroked
rings, 3 stroked line bars), per resolved decision 10:
- For each target size, scale the source proportions (outer `30×30`
  square with `8`-unit corner radius containing an inner `17×17`-viewBox
  glyph: rounded rect, 5 circles at `cx=2.4`,
  `cy=3.4/6.2/9/11.8/14.6`, `r=1`, `stroke-width=1`; 3 line segments
  `M7 5H12.5`, `M7 8H12.5`, `M7 11H10.5`, `stroke-width=1`) to that
  size's pixel dimensions.
- Background pixel test: point-in-rounded-rect (navy `#081A59` inside,
  transparent/background outside).
- Each ring: distance-from-center test, paint cyan (`#D9FAFF`) only
  when within the scaled stroke band (a stroke, not a fill — ring
  interior stays background).
- Each bar: distance-to-segment test, paint navy when within
  `strokeWidth/2` (a thickened line).
Generate all four required outputs into `public/icons/`:
`icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon-180x180.png`
(all: rounded-square proportions, per resolved decision 11), and
`icon-512x512-maskable.png` (full-bleed navy square, no rounded
corners, inner glyph scaled to the ~80% safe zone, per resolved
decision 11). Run `node generate-icons-simple.js` once to regenerate
the actual PNGs in `public/icons/` as part of this task.
Depends on: Task 17 (reuses the same shape/color constants conceptually,
even though this script is plain Node.js and can't literally import the
React/JSX file — keep the coordinate data and colors in sync by
eyeballing `AppIcon.tsx`'s values when writing the per-pixel tests).

**Test cases:** manual verification only (no meaningful unit test for a
one-off image-generation script) — run `node generate-icons-simple.js`,
confirm all 4 files in `public/icons/` are valid PNGs at their expected
dimensions (`file public/icons/*.png` or open them), and visually match
`AppIcon.tsx`'s rendering (navy background, cyan glyph, correct corner
rounding on the 3 non-maskable variants, full-bleed on the maskable
one, rings appearing as thin outlined circles rather than filled disks).

**Acceptance criteria:** `generate-icons.js` deleted;
`generate-icons-simple.js` produces all 4 PNGs at the vite-plugin-pwa
manifest's expected sizes/names (`vite.config.ts`'s `manifest.icons`
list is unchanged — same filenames, so no `vite.config.ts` edit
needed); the 4 regenerated files are committed to `public/icons/`; no
new dependency (native or otherwise) is added to `package.json`.

### 20. Manual smoke pass + `npm run build` + `npm test`
Run the full build and test suite. Manually verify (via `/run` skill
or dev server) end-to-end:
- Nav: single rail, single hamburger toggling it, works identically on
  a resized-narrow and resized-wide browser window.
- Mode: "All entries" feed shows every active entry newest-first, each
  with a visible date label; composer only shows there; tag/search
  modes unaffected.
- New entry gets today's date regardless of any prior filter state.
- Icon: rail header logo, browser tab favicon, and (if testable via
  "Install app"/PWA manifest inspection in devtools Application tab)
  the manifest icons all show the same navy-square notebook glyph.
- Archived: nav button is icon-only with a badge that matches the
  actual archived count; archiving an entry increments it; restoring
  from `ArchiveView` and navigating back decrements it correctly;
  `ArchiveView`'s heading reads "Archived".
- Settings icon button opens Settings unchanged; About row (still
  text, still full-width) opens About unchanged.
Depends on: all prior tasks.

**Acceptance criteria:** `npm run build` clean, `npm test` full suite
green, all bullets above manually confirmed.

## Test Cases Summary

- `mode.test.ts` — `'all'` replaces `'day'` in every existing
  expectation (Task 1).
- `entryFiltering.test.ts` — `'all'` mode signature drops
  `selectedDate`, returns all entries unfiltered but sorted; paragraph
  filtering unchanged (Task 2).
- `entriesRepo.test.ts` — 3 new cases for `countArchivedEntries()`:
  partial-archive count, zero-entries count, count-after-restore
  (Task 6).
- `ArchiveView.test.tsx` — heading text assertion updated to "Archived"
  (Task 16).
- Manual/visual verification for all UI-only changes (rail merge,
  footer icon row + badge, hamburger always-on, icon swap, icon PNG
  regeneration) — these don't have existing component test
  infrastructure to extend cheaply, per the codebase's current test
  coverage (component tests exist for `ArchiveView`, `SettingsView`,
  `ShareModal`, but not `LeftRail`/`RightRail`/`DiaryHeader`).

## Acceptance Criteria (feature-level)

- [ ] `LeftRail.tsx` is the single rail; `RightRail.tsx`/`.css` deleted;
      `App.tsx` renders exactly one rail component.
- [ ] `ViewMode` is `'all' | 'tag' | 'search'`; `'all'` is the default,
      no-filter mode, returns every active entry sorted newest-first.
- [ ] Every entry always shows its date label (not gated by mode
      anymore).
- [ ] New entries are always created with `getTodayISO()`, regardless
      of any previously-selected date (the concept of a selected date
      no longer exists).
- [ ] Single hamburger button in `DiaryHeader` toggles the one rail;
      works identically on mobile and desktop; no second toggle button
      exists.
- [ ] `leftOpen` defaults to `true` on load on both mobile and desktop;
      user can close it on either; resizing the window does not force
      it back open.
- [ ] Backdrop only appears on mobile when the rail is open; never on
      desktop.
- [ ] App icon (in-rail logo + all 4 PWA/favicon PNGs — 192, 512,
      512-maskable, apple-touch-icon-180) all derive from the same SVG
      source and visually match each other.
- [ ] Nav footer: Archived + Settings render as two icon-only buttons
      in one row (box icon + gear icon, from the mock); Archived shows
      a live count badge that's hidden entirely when the count is 0;
      About remains its own full-width text-only row, unchanged.
- [ ] `ArchiveView`'s heading reads "Archived".
- [ ] `npm run build` and `npm test` pass clean.

## Open Questions / Risks Found While Reading Code

- **`by-archived` IndexedDB index likely never worked.** `db.ts`
  declares `entriesStore.createIndex('by-archived', 'archived')`, but
  `archived` is a `boolean` field, and IndexedDB's key spec doesn't
  accept booleans as valid index keys — records get silently excluded
  from that index rather than erroring. This plan works around it in
  `countArchivedEntries()` (Task 6 uses a cursor walk, not the index),
  and since Task 6 is already touching `db.ts`/`entriesRepo.ts` for
  that work, this plan now also deletes the dead index itself (see
  Task 6's index-deletion note) rather than leaving it as a follow-up.
