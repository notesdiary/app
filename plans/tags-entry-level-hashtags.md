# Plan: Entry-Level Hashtags (Trailing Tag-Only Section)

## Overview

Let an author tag a WHOLE entry with hashtags in one place instead of
repeating `#tag` in every section. Mechanism: if the LAST section of an
entry (per `splitSections`, `src/lib/tags.ts`) contains nothing but
`#tag`s and whitespace ("tag-only"), those tags become "entry-level
tags" for that entry. When filtering by tag mode and a selected tag is
one of an entry's entry-level tags, show ALL sections of that entry
(not just the ones individually containing the tag). No change to
which entries show up in tag-mode lists (`filterEntries` untouched).
No rendering changes (a tag-only section already renders as a plain
row of tag chips). Retroactive: since tags are computed at render
time, any existing entry whose last section already happens to be
tag-only becomes entry-level the moment this ships — intentional, no
migration.

Read before implementing (do not re-derive, just point to them):
`product-behavior.md` "Diary view" (line ~19-27) and "Left rail (tag
browser)" (line ~29-33); `design.md` "Data flows" (line ~84-91) and
"Design patterns" (line ~93-98).

## Resolved Decisions (baked in, not open questions)

1. Add `isTagOnlySection(section: string): boolean` to
   `src/lib/tags.ts`: run `splitParts(section)`, return true iff every
   non-tag part's `text.trim()` is `''` (whitespace-only or empty).
   Empty-string input → `splitParts('')` returns `[{text: '', isTag:
   false}]` → trims to `''` → counts as tag-only (only matters if a
   section can ever be `''`; `splitSections` never emits empty
   sections today, but the helper itself should be correct in
   isolation per the spec's "empty section" test case).
2. Add `getEntryLevelTags(text: string): string[]` to
   `src/lib/tags.ts`: `const sections = splitSections(text); if
   (sections.length === 0) return []; const last = sections[sections.length
   - 1]; if (!isTagOnlySection(last)) return []; return
   extractTags(last);`.
3. `filterEntries` in `src/lib/entryFiltering.ts`: NO CHANGE. Its
   "any section anywhere has a selected tag" semantics already cover
   entry-level tags correctly (they live in one real section).
4. `filterParagraphsInEntry` in `src/lib/entryFiltering.ts`, `mode ===
   'tag'` branch: before the existing per-section filter, compute
   `const entryLevelTags = getEntryLevelTags(entry.text);` and `const
   matchesEntryLevel = selectedTags.some(st => entryLevelTags.includes(st));`
   (no `__untagged__` special-case needed here — entry-level tags are
   always real tags, never the untagged pseudo-tag). If
   `matchesEntryLevel`, `return sections;` (the full array, unchanged
   order, including the trailing tag-only section itself). Otherwise
   fall through to exactly today's per-section filter logic
   (unchanged). This is a union/OR with the existing per-section
   result — entry-level match always wins to "show more."
5. `src/components/LeftRail.tsx` tag counting: NO code change. Its
   per-section counting loop (`LeftRail.tsx:24-38`) already counts a
   trailing tag-only section's tags once (it's just another section).
   The counting logic is **inline in the component body, not an
   exported pure function** — do NOT extract one (that would be a code
   change to `LeftRail.tsx`, which is out of scope); the regression
   test must render `<LeftRail>` with all its props.
   Consequence, accepted as-is: for an entry like `'body\n\n#work'`,
   the `'body'` section still has zero tags, so it still contributes
   `+1` to the **Untagged** count, and `__untagged__` filtering still
   shows that section. Entry-level tagging does not suppress this.
6. `src/components/EntryContent.tsx`: NO code change. It renders each
   section through `ReactMarkdown` with tag-aware component wrappers,
   so a tag-only section is one paragraph of tag `<button>`s. Note
   `#work` is *not* an ATX heading in GFM (no space after `#`), so
   markdown does not interfere. Verified by an added test in the
   existing `src/__tests__/EntryContent.test.tsx`, not by manual check
   alone.
7. No UI copy changes (composer placeholder etc. unchanged).
8. Tests go in the existing `src/__tests__/tags.test.ts`,
   `src/__tests__/entryFiltering.test.ts`, and
   `src/__tests__/EntryContent.test.tsx` (all three already exist —
   extend them, don't create new files). There is **no** existing
   LeftRail test file (confirmed: `src/__tests__/` has none), so T5
   creates `src/__tests__/LeftRail.test.tsx` following the RTL
   conventions in `EntryContent.test.tsx` / `ArchiveView.test.tsx`.
9. `getEntryLevelTags` returns `extractTags(last)` verbatim, so a
   repeated tag in the last section yields duplicates (e.g.
   `'#work #work'` → `['#work', '#work']`). Harmless — the only
   consumer uses `.includes()`. Do not add dedupe.

## Non-goals / Out of scope

- No change to `filterEntries` (entry-list membership in tag mode).
- No change to search mode or 'all' mode behavior anywhere.
- No change to `LeftRail.tsx` counting code (test-only). In
  particular, an entry-level-tagged entry's untagged body sections
  still count toward the "Untagged" total — not fixed here.
- No change to `EntryContent.tsx` rendering code (test-only).
- No change to `__untagged__` semantics anywhere: an entry-level tag
  never suppresses a body section from matching `__untagged__` in
  `filterParagraphsInEntry` or `filterEntries`.
- No migration, opt-out flag, or warning UI for retroactive effect.
- No walking-backward merge of multiple trailing tag-only sections —
  only the literal last section is ever entry-level.

## Files touched

- `src/lib/tags.ts` — add `isTagOnlySection`, `getEntryLevelTags`.
- `src/lib/entryFiltering.ts` — update `filterParagraphsInEntry`
  tag-mode branch.
- `src/__tests__/tags.test.ts` — new tests for the two new helpers.
- `src/__tests__/entryFiltering.test.ts` — new tests for
  `filterParagraphsInEntry` entry-level behavior + `filterEntries`
  regression.
- `src/__tests__/EntryContent.test.tsx` — tag-only-section rendering
  regression test.
- `src/__tests__/LeftRail.test.tsx` (new file) — counting regression
  test.
- `product-behavior.md` — "Diary view" + "Tag filter" bullet updates.
- `design.md` — "Data flows" / "Design patterns" mention of the new
  concept and where it lives.
- `AGENTS.md` — "Tags and filtering" section (line ~43-46) mirrors the
  same summary; CLAUDE.md's ground rules require updating it. (Its
  content duplicates `CLAUDE.md`'s "Tags and filtering" section —
  update **both** so they stay in sync.)
- `plans/tags-entry-level-hashtags.md` — this plan file itself is
  currently untracked; `plans/*.md` are committed in this repo, so it
  goes in the commit too.

## Task List

Each task ≤30 min. Deps noted as `depends: T#`.

---

### T0 — Create isolated git worktree

No deps.

- From repo root run:
  `git worktree add ../worktree-tags-entry-level-hashtags -b tags-entry-level-hashtags/entry-tags`
- `cd ../worktree-tags-entry-level-hashtags`
- `npm install` (worktrees don't share `node_modules`, it's gitignored).
- Acceptance: `npm test` runs clean (baseline pass, no code changes
  yet) inside the new worktree.

---

### T1 — Read current source + confirm insertion points

depends: T0

- Re-read `src/lib/tags.ts` in full (short file) in the worktree copy.
- Re-read `src/lib/entryFiltering.ts` in full.
- Re-read `src/__tests__/tags.test.ts` and
  `src/__tests__/entryFiltering.test.ts` to match existing test style
  (describe/it structure, fixture shape for `Entry` objects).
- Re-read `src/__tests__/EntryContent.test.tsx` for the component-test
  render pattern (T4 extends it).
- Already confirmed against `main`, re-verify only if the worktree
  diverges: no `src/__tests__/LeftRail*.test.*` exists, and
  `LeftRail.tsx`'s counting loop is inline in the component body
  (`LeftRail.tsx:24-38`) — not an exported pure function.
- No code change this task. Acceptance: you can point to the exact
  line in `filterParagraphsInEntry`'s `mode === 'tag'` block where the
  new entry-level check will be inserted (today: the `return
  sections.filter(...)` at `src/lib/entryFiltering.ts:65`), and
  confirm current test file structure/imports to match.

---

### T2 — Add `isTagOnlySection` + `getEntryLevelTags` to `src/lib/tags.ts`

depends: T1

- Add both functions per Resolved Decision 1-2 above, exported
  alongside existing `splitParts`/`splitSections`/`extractTags`.
- Test cases (add to `src/__tests__/tags.test.ts`):
  - `isTagOnlySection('#work #urgent')` → `true`.
  - `isTagOnlySection('#work urgent stuff')` → `false` (tag + prose).
  - `isTagOnlySection('#work, #urgent')` → `false` (comma punctuation
    between tags is non-tag text, not whitespace).
  - `isTagOnlySection('')` → `true` (empty section, no non-whitespace
    non-tag content).
  - `isTagOnlySection('   ')` → `true` (whitespace-only).
  - `isTagOnlySection('#work\n#urgent')` → `true` (tags separated by
    newline within one section — newline is whitespace).
  - `getEntryLevelTags('line one\n\n#work #urgent')` → `['#work',
    '#urgent']` (trailing tag-only section).
  - `getEntryLevelTags('#work #urgent\n\nline one')` → `[]` (tag-only
    section is NOT last).
  - `getEntryLevelTags('#work #urgent')` → `['#work', '#urgent']`
    (single-section entry, trivially entry-level).
  - `getEntryLevelTags('just prose, no tags')` → `[]`.
- Acceptance: `npx vitest run src/__tests__/tags.test.ts` green;
  `npm run build` typechecks clean.

---

### T3 — Update `filterParagraphsInEntry` in `src/lib/entryFiltering.ts`

depends: T2

- Import `getEntryLevelTags` from `./tags` alongside existing
  `splitParts, splitSections` import.
- In the `mode === 'tag'` branch, implement per Resolved Decision 4:
  compute `entryLevelTags`/`matchesEntryLevel` before the existing
  `sections.filter(...)`, short-circuit-return all `sections` if
  `matchesEntryLevel`, else fall through unchanged.
- Do NOT touch `filterEntries` — confirm by diff that
  `filterEntries`'s tag-mode branch is byte-identical before/after
  this task.
- Test cases (add to `src/__tests__/entryFiltering.test.ts`):
  - Entry with trailing tag-only section (`'note text\n\n#work'`),
    `selectedTags = ['#work']`, mode `'tag'` → returns BOTH sections
    (full entry, including the trailing tag-only one).
  - Entry where `#work` also appears in an earlier normal (non-last,
    non-tag-only) section, e.g. `'#work stuff here\n\nmore text\n\n#personal'`
    — filtering by `#work` (not the entry-level tag `#personal`)
    still returns only the section(s) that literally contain `#work`
    (today's section-level behavior preserved for non-entry-level
    tags).
  - Entry with a NON-trailing tag-only section, e.g. `'#work\n\nprose
    section'` — filtering by `#work` returns ONLY the first section
    (old per-section behavior preserved; NOT promoted to entry-level
    since it isn't last).
  - Entry with two trailing tag-only sections, e.g. `'body\n\n#early\n\n#late'`
    — filtering by `#late` (the true last section's tag) returns all
    sections (entry-level). Filtering by `#early` (the earlier
    tag-only section, not the last) returns only that one section
    (still section-level, no backward-merge).
  - `filterEntries` regression: entry with only an entry-level tag
    (e.g. `'body text\n\n#project'`) still appears in the tag-mode
    entry list when filtering by `#project` (assert unchanged
    pre/post behavior — this test should pass even before T3's code
    change, confirming `filterEntries` needs no edit).
  - `__untagged__` regression: entry `'body text\n\n#project'`,
    `selectedTags = ['__untagged__']`, mode `'tag'` → returns ONLY the
    `'body text'` section (entry-level tags must not swallow the
    untagged branch; `matchesEntryLevel` is false because
    `entryLevelTags` never contains `__untagged__`).
  - Multi-select union: entry `'body\n\n#project'`, `selectedTags =
    ['#other', '#project']` → returns both sections (OR semantics
    preserved through the entry-level check).
  - Retroactive-behavior test: an "old-style" entry authored as if
    before this feature — text `'meeting notes here\n\n#meeting'` —
    behaves as entry-level after the change (filtering by `#meeting`
    shows the whole entry, not just the trailing line), documenting
    the accepted retroactive effect as intentional.
- Acceptance: `npx vitest run src/__tests__/entryFiltering.test.ts`
  green; `npm run build` typechecks clean.

---

### T4 — `EntryContent.tsx` rendering regression test (+ optional visual check)

depends: T3

Per CLAUDE.md, prefer a test over a manual check.

- Add to the existing `src/__tests__/EntryContent.test.tsx`: render
  `<EntryContent text={'Went for a walk\n\n#health #outdoors'}
  interactive />` and assert the trailing section renders as exactly
  two `.tag-link` buttons (`#health`, `#outdoors`) with no other
  visible text in that section — i.e. markdown does not turn a leading
  `#health` into a heading (GFM needs `# ` with a space) and no stray
  whitespace artifacts appear.
- No production code change to `EntryContent.tsx`.
- Optional manual sanity check (not required to pass T6): `./start.sh`
  (kills :5173, builds, previews) — `npm run dev` also works but will
  collide if a dev server is already on :5173. Create an entry with a
  trailing tag-only section, click one of those trailing tags, and
  confirm the diary view shows the *full* entry, not just the tag row.
- Acceptance: new test passes; if any visual regression is found,
  stop and flag it — it is a bug requiring a new task, not a silent
  fix here.

---

### T5 — LeftRail tag-counting regression test

depends: T3

- Create `src/__tests__/LeftRail.test.tsx` (no LeftRail test file
  exists) following the RTL + vitest conventions in
  `EntryContent.test.tsx` / `ArchiveView.test.tsx`.
- The counting logic is inline in the component, so the test must
  render the component. `LeftRail` requires all of: `entries`,
  `selectedTags`, `onTagClick`, `archivedCount`, `onSettingsClick`,
  `onArchiveClick`, `onAboutClick`, `onSwitchProjectClick`,
  `isMobile`, `isOpen` — pass `vi.fn()` for the callbacks.
- Counts are **per section**, not per entry. Test case: entry A =
  `'note\n\n#work #urgent'` (trailing tag-only section), entry B =
  `'#work in prose'`. Assert:
  - `#work` count is `2` (one section in each entry) — the trailing
    tag-only section counts exactly once, same as any other section;
    no double-count, no under-count.
  - `#urgent` count is `1`.
  - `Untagged` count is `1` (entry A's `'note'` section) —
    documenting that entry-level tagging does NOT suppress the
    untagged count, per Non-goals.
- Assert against the rendered `.tag-name` / `.tag-count` pairs.
- Acceptance: new test passes with zero production code changes in
  `LeftRail.tsx`.

---

### T6 — Full suite + build check

depends: T4, T5

- Run `npm run build` (typecheck + build) — must pass.
- Run `npm test` — full suite must pass, including all new tests from
  T2/T3/T4/T5.
- Acceptance: both commands green.

---

### T7 — Update `product-behavior.md`

depends: T6

- "Diary view" section (currently line ~19-27): add a bullet after
  the existing "Tags" bullet describing entry-level tags — if an
  entry's LAST section contains only `#tag`s (and whitespace), those
  tags are "entry-level" for the whole entry; note this is
  retroactive/automatic (computed at render time, no persisted flag).
- "Tag filter" bullet (line ~27): add a clause noting the exception —
  when a selected tag is one of a matched entry's entry-level tags,
  ALL of that entry's sections display (not just tag-matching ones);
  otherwise today's "only matching sections display" behavior is
  unchanged.
- Keep terse, bullet style, no narrative, matching existing doc tone.
- Acceptance: section reads accurately against shipped behavior; no
  stale references implying all filtering is purely per-section.

---

### T8 — Update `design.md`

depends: T6

- "Data flows" section (line ~84-91): the "Filter/search" bullet
  mentions `filterEntries`/`filterParagraphsInEntry` — extend it (or
  add a clause) noting `filterParagraphsInEntry` now also consults
  `getEntryLevelTags` (`src/lib/tags.ts`) to decide whether to return
  all sections vs. the per-section-matched subset.
- "Design patterns" section (line ~93-98): if it's the right place,
  add a one-line note on where the entry-level-tag concept lives
  (`isTagOnlySection`/`getEntryLevelTags` in `src/lib/tags.ts`,
  consumed only by `filterParagraphsInEntry` in
  `src/lib/entryFiltering.ts`; `filterEntries` and `LeftRail.tsx`
  counting are unaffected by design).
- Acceptance: no stale/contradicted content, terse.

---

### T8b — Update `AGENTS.md` + `CLAUDE.md` "Tags and filtering"

depends: T6

- CLAUDE.md ground rules require updating `CLAUDE.md`/`AGENTS.md` on
  every change, independent of the user asking. Both files carry a
  near-identical "Tags and filtering" section (`AGENTS.md` line
  ~43-46; the matching section in `CLAUDE.md`).
- Add one bullet to each, kept in sync: a trailing tag-only section
  makes its tags entry-level for the whole entry, consumed only by
  `filterParagraphsInEntry` (`src/lib/entryFiltering.ts`) to return
  all sections instead of the matched subset; derived at render time,
  never persisted.
- Acceptance: both files updated identically; no other section drift.

---

### T9 — Full-file review of both reference docs

depends: T7, T8, T8b

- Per CLAUDE.md "Full-file review after major changes" (this is a
  behavior shift, not a trivial edit): re-read `product-behavior.md`
  in full and `design.md` in full.
- Check: no inconsistencies across sections, no stale/contradicted
  content, accurate to code as it now stands, still token-optimized
  (terse, no redundancy, no narrative drift).
- Fix any issues found before proceeding.
- Acceptance: both files pass this review with no outstanding fixes.

---

### T10 — Commit

depends: T9

- `git add` the specific changed files: `src/lib/tags.ts`,
  `src/lib/entryFiltering.ts`, `src/__tests__/tags.test.ts`,
  `src/__tests__/entryFiltering.test.ts`,
  `src/__tests__/EntryContent.test.tsx`,
  `src/__tests__/LeftRail.test.tsx`, `product-behavior.md`,
  `design.md`, `AGENTS.md`, `CLAUDE.md`,
  `plans/tags-entry-level-hashtags.md`. Do NOT `git add -A`.
- Commit message describing the "why" (lets an author tag a whole
  entry once via a trailing tag-only section, instead of repeating
  `#tag` per section), not just "what". Include the one-line
  retroactive-behavior callout from Risks.
- Acceptance: `git status` in the worktree shows no modified/untracked
  files left over; `npm test` and `npm run build` green on the commit.

---

### T11 — Tear down worktree

depends: T10

- Confirm with the user first: local merge vs. push + PR. (This plan
  does not resolve it; prior plans in this repo end with a local
  merge — see the `61586b9 Merge branch
  'project-picker-drive-discovery/main'` commit on `main`.)
- **`main` cannot be checked out inside the worktree** — it is already
  checked out in the primary worktree, so git refuses. Order matters:
  1. `cd /Users/mdoraiswamy/work/notesdiary/app` (primary worktree,
     already on `main`).
  2. Local-merge path: `git merge tags-entry-level-hashtags/entry-tags`.
     PR path instead: from the worktree, `git push -u origin
     tags-entry-level-hashtags/entry-tags` then `gh pr create`, and
     skip the merge.
  3. `git worktree remove ../worktree-tags-entry-level-hashtags`
     (must not be run from inside the worktree).
- Acceptance: `git worktree list` no longer shows the removed
  worktree; the branch still exists with the commit; primary
  directory's `git status` is clean.

---

## Test Strategy Summary

- Unit-level: `isTagOnlySection`/`getEntryLevelTags` correctness
  (tag-only detection incl. punctuation/whitespace edge cases) —
  covered in T2.
- Unit-level: `filterParagraphsInEntry` entry-level vs. section-level
  branching, including the "multiple trailing tag-only sections, only
  last counts" and "retroactive" cases — covered in T3.
- Regression: `filterEntries` unaffected — covered in T3.
- Regression: `filterParagraphsInEntry` `__untagged__` branch and
  multi-select OR semantics unaffected — covered in T3.
- Regression: `LeftRail` counting unaffected (incl. the accepted
  Untagged-count interaction) — covered in T5.
- Regression: `EntryContent.tsx` renders a tag-only section as a bare
  chip row (no markdown heading interference) — covered in T4,
  automated; optional manual pass on top.
- Integration: full build + full test suite green — covered in T6.

## Risks

- Line numbers cited for `product-behavior.md` (Diary view 19-27, Tag
  filter 27), `design.md` (Data flows 84-91, Design patterns 93-98),
  and `AGENTS.md` (Tags and filtering 43-46) were verified accurate
  against `main` at plan time, but may shift by the time T7/T8/T8b
  run — re-locate the named sections by heading text, not line number.
- `design.md:25` and `:27` describe `tags.ts` / `entryFiltering.ts` in
  the directory tree with one-line comments that stay accurate — no
  edit needed there, don't churn them.
- `isTagOnlySection`'s whitespace-trim check must correctly treat
  newlines-between-tags as whitespace (a tag-only section can span
  multiple lines, e.g. `'#work\n#urgent'`) — explicitly covered by a
  T2 test case to avoid an off-by-logic bug here.
- Because this is retroactive by design, any pre-existing entry in a
  real user's data whose last section happens to already be a bare
  tag line will silently change display behavior on upgrade — this is
  the accepted spec, not a bug, but worth a one-line callout in the
  commit message (T10) so it's not mistaken for a regression later.

## Open Questions Resolved By Judgment (flag to user)

- None load-bearing to correctness. One minor judgment call: whether
  `isTagOnlySection` treats an entirely empty string (`''`) as
  tag-only (`true`, since there's no non-whitespace non-tag content).
  This can never actually occur as input from `splitSections` (which
  never emits empty-string sections), so the choice is inert in
  practice, but T2 includes a test asserting `true` for `''` per the
  spec's explicit "empty section" test-case requirement, in case the
  helper is ever called directly with `''` from other code later.
