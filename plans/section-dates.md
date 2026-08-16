# Plan: Section Dates (`@YYYY-MM-DD` tags on a paragraph)

## Overview

Let an author stamp a single **section** (paragraph, per `splitSections`,
`src/lib/tags.ts`) with one date, separate from the entry's own `date`
field. Mechanism: an inline text token `@YYYY-MM-DD` (zero-padded,
calendar-valid) embedded in the section's raw text, parsed at render
time exactly like `#tags` today — no schema change, no IndexedDB
migration. Same "derive everything from `entry.text`" pattern as tags
and as the entry-level-hashtags feature (`plans/tags-entry-level-hashtags.md`).

Two independent halves of work, buildable in either order after setup:

1. **Read-mode + filtering half**: parse the token, render it as a
   distinct pill (not a raw `@2026-01-05` string), wire a new
   single-select `selectedDate` filter (toggles off on a second click,
   same as tag selection) that ANDs with the existing `selectedTags`
   OR-filter, add a "Browse by date" list to the left rail (below the
   existing tag list), and cover the archive view's non-interactive
   rendering.
2. **Editor-popover half**: brand new isolated utility code — detect
   the typed shorthand `@` + digit at a word boundary inside a plain
   `<textarea>`, open an inline popover anchored at the caret
   (mirror-div technique, no existing precedent in this codebase), let
   the user pick a date via a native `<input type="date">`, and splice
   the resulting token into the textarea text. This applies to BOTH
   raw-text textareas in the app: the existing-entry edit textarea
   (`EntryRow.tsx`) and the new-entry composer textarea
   (`Composer.tsx`) — same trigger/popover utilities, wired in twice.
   No new save path either way — same blur → save flow as today
   (`handleEditSave`/`updateEntryText` for edits, `handleComposerBlur`/
   `createEntry` for new entries).

**Retroactive by design**: because parsing happens at render time from
`entry.text`, any existing entry text that already happens to contain
a syntactically-valid `@YYYY-MM-DD` token becomes a dated section the
moment this ships. No migration, no opt-out. Same accepted-tradeoff
shape as the entry-level-hashtags plan's retroactive effect.

Read before implementing (do not re-derive, just point to them):
`product-behavior.md` "Diary view" (line ~19-27), "Left rail (tag
browser)" (line ~29-33), "Archive view" (line ~35-40); `design.md`
"Data flows" (line ~84-91) and "Design patterns" (line ~93-98);
`AGENTS.md`/`CLAUDE.md` "Tags and filtering" (line ~43-46 in both).

## Resolved Decisions (baked in, not open questions)

1. **Token regex** (`src/lib/tags.ts`), boundary-aware to avoid
   collateral matches on ordinary `@`-containing text:
   ```
   const SECTION_DATE_TOKEN_RE = /(?<=^|\s)@(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
   ```
   Lookbehind requires the `@` to be at start-of-text or right after
   whitespace; negative lookahead `(?!\d)` blocks a stray extra digit
   (`@2026-01-051`) from silently truncating to a valid-looking date.
2. `findAcceptedDateToken(section: string): { index: number; raw: string; iso: string } | null`
   — iterate all regex matches, calendar-validate each (see #3), return
   the **first** calendar-valid one (index/raw span/`YYYY-MM-DD`
   without the `@`). Earlier syntactically-matching-but-invalid tokens
   (e.g. `@2026-13-45`) are skipped over, not treated as "the first"
   — they don't block a later valid token from winning. Reset
   `lastIndex = 0` before each call (module-level regex + `g` flag).
3. Calendar validity via UTC round-trip (catches `Feb 30`, `Apr 31`,
   month `00`/`13`, day `00`):
   ```
   function isValidCalendarDate(y: number, m: number, d: number): boolean {
     if (m < 1 || m > 12) return false;
     const dt = new Date(Date.UTC(y, m - 1, d));
     return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
   }
   ```
4. `parseSectionDate(section: string): string | null` = thin wrapper:
   `findAcceptedDateToken(section)?.iso ?? null`.
5. `splitPartsWithDate(text: string, acceptedIso: string | null): Part[]`
   — new function, `Part` gains optional `isDate?: boolean` and
   `date?: string` (the ISO value without the `@`, so the renderer
   doesn't have to re-slice `part.text`). Existing
   `splitParts`/callers untouched; `toEqual` checks in `tags.test.ts`
   stay green since `isDate: undefined` is equality-equivalent to
   absent). Algorithm: collect tag matches (existing tag regex) +
   **at most one** date match into one index-sorted list, then walk it
   building `Part[]` the same way `splitParts` does today (push
   preceding plain-text part, then the tag/date part, repeat, trailing
   plain text at the end). Preserve `splitParts`'s fallback: if no
   matches at all, return `[{ text, isTag: false }]`. Any other
   `@YYYY-MM-DD`-shaped substring (a second valid one, or an invalid
   one) is never split out — it stays embedded in a plain-text part,
   rendered as inert literal text. `splitParts` itself is NOT modified
   — `splitPartsWithDate` is a new, separate function consumed only by
   `EntryContent.tsx`.

   **Why the explicit `acceptedIso` parameter (load-bearing — do not
   "simplify" it away):** `EntryContent` does NOT call the parser on
   raw section text. It renders each section through `ReactMarkdown`
   and calls `renderTagsInText` on the *string children of markdown
   AST nodes*, which for a single section can be several separate
   strings (`**a** @2026-01-05` → `[<strong>, ' @2026-01-05']`; a
   two-item list → two `<li>` children; anything with inline emphasis
   → a split children array). A self-contained "find the first valid
   token in whatever string I'm handed" function would therefore
   produce **one pill per markdown child**, contradicting the
   section-level "first valid token wins" contract that
   `parseSectionDate` (which *does* see the raw section) enforces for
   filtering and the left rail — a section could render a clickable
   `2026-02-10` pill that no filter ever matches. So:
   - `EntryContent` computes `const acceptedIso = parseSectionDate(section)`
     **once per section**, before rendering that section's markdown.
   - It also keeps a per-section mutable "already emitted" flag
     (a `let` in the section's render closure, reset for each section).
   - `splitPartsWithDate(childText, acceptedIso)` flags a date part
     only if `acceptedIso !== null`, the matched token's ISO equals
     `acceptedIso`, and the flag is still unset; it sets the flag on
     the first hit. Every later occurrence — in the same child string
     or a later one — stays plain text.
   - Implementation note: because the flag has to be shared across
     multiple `renderTagsInText` calls, thread it as a third
     `alreadyEmitted: { done: boolean }` argument (or have
     `EntryContent` do the "is this the accepted, not-yet-emitted
     token" check and pass a plain boolean `allowDate`). Either shape
     is fine; what is not fine is `splitPartsWithDate` deciding
     "first" from the child string alone.
6. `src/lib/dateUtils.ts`: add `formatDateWithYear(iso: string): string`
   → e.g. `"Jan 5, 2026"` (reuses the existing month-name array
   pattern from `formatDate`, but includes the year — `formatDate`
   itself is unchanged, used elsewhere for the entry header which
   doesn't want a year).
7. `src/components/EntryContent.tsx`: swap the `splitParts` call in
   `renderTagsInText` for `splitPartsWithDate` (per-section
   `acceptedIso` + emitted-flag plumbing described in #5). Add
   `onDateClick?: (date: string, e: React.MouseEvent) => void` prop.
   For a part with `isDate: true`: interactive → `<button
   className="date-pill" onClick={...}>{formatDateWithYear(part.date)}</button>`
   (stopPropagation same as tag buttons, so it never also fires
   `onSectionClick`); non-interactive → `<span className="date-pill-text">`
   with the same label. Visually distinct from `.tag-link`/`.tag-text`
   (new CSS class, different color and/or small calendar glyph —
   implementer's choice of exact styling, just must not be
   visually identical to a tag chip).
   **CSS home**: `EntryContent.tsx` has NO stylesheet of its own —
   `.tag-link` lives in `src/components/EntryRow.css` (imported by
   `EntryRow.tsx`, and relied on globally by `ArchiveView` since Vite
   bundles CSS app-wide; note `.tag-text` has no rule at all today).
   Put `.date-pill` / `.date-pill-text` next to `.tag-link` in
   `EntryRow.css` — do NOT invent an `EntryContent.css` import, and do
   NOT assume ArchiveView pulls in its own copy.
8. **Click behavior**: clicking a date pill in read mode calls
   `onDateClick(iso, e)`, which (via `App.tsx`) sets `selectedDate` —
   exactly analogous to a tag click, single-select instead of
   multi-select. It never opens an editor. To change/remove a date the
   user edits the underlying text directly (same as removing a
   `#tag` today) — no dedicated "edit this date" affordance.
9. **Filter state** (`App.tsx`): `const [selectedDate, setSelectedDate] = useState<string | null>(null);`
   alongside `selectedTags`. `handleDateClick(date)`: **toggle —
   confirmed behavior, not a judgment call** — if `selectedDate ===
   date`, set `null` (deselect); else set `date` (single-select,
   replaces any prior selection). Same `closeDrawersOnMobile()` call as
   `handleTagClick`. This mirrors clicking an already-selected tag,
   which also deselects it. Covered by an explicit toggle test in T9
   (see below) since no existing `App.tsx`-level test exercises this
   shape of handler today.
10. `src/lib/mode.ts`: `deriveMode(searchQuery: string, selectedTags: string[], selectedDate: string | null = null): ViewMode`.
    **The default is required, not cosmetic**: `src/__tests__/mode.test.ts`
    has 7 existing 2-arg call sites (lines 7, 12, 17, 22, 27, 32, 37);
    a required third param breaks `tsc` on all of them. Same
    default-param compatibility story as `entryFiltering.ts` in #11.
    `ViewMode` stays `'all' | 'tag' | 'search'` — no new mode name.
    `'tag'` is redefined in the doc comment to mean "tag and/or date
    filter active" (not "tag filter active"). Precedence unchanged:
    `search` wins if `searchQuery` non-empty; else `'tag'` if
    `selectedTags.length > 0 || selectedDate !== null`; else `'all'`.
    This is the one naming nuance from the spec — resolved by keeping
    `'tag'` and documenting the broadened meaning inline.
11. `src/lib/entryFiltering.ts`: both `filterEntries` and
    `filterParagraphsInEntry` gain a 5th param
    `selectedDate: string | null = null` (default keeps existing
    4-arg call sites/tests compiling and behaviorally unchanged). In
    the `mode === 'tag'` branch, replace the per-section predicate
    with an AND of tag-match-or-no-tags-selected and
    date-match-or-no-date-selected:
    ```
    const tagOk = selectedTags.length === 0
      ? true
      : selectedTags.some(st => st === '__untagged__' ? tags.length === 0 : tags.includes(st));
    const sectionDate = parseSectionDate(section);
    const dateOk = selectedDate === null || sectionDate === selectedDate;
    return tagOk && dateOk;
    ```
    **Important bug-shaped edge case**: today `selectedTags.some(...)`
    on an empty array is `false`, which was harmless because mode
    `'tag'` never occurred with an empty `selectedTags` before this
    feature. Now it can (date-only selection) — the `selectedTags.length === 0 ? true : ...`
    guard is a required behavior change, not just an additive one.
    T6 includes a test that fails without this guard, per CLAUDE.md's
    "add a test that reveals the bug, then fix" rule.
12. **No `__untagged__`-style pseudo-bucket for dates.** No "sections
    without a date" browsable group anywhere (left rail, filters).
12b. **Prop-threading chain (previously missed — `App.tsx` does NOT
    render `<EntryRow>` or `<Composer>` directly).** The real tree is
    `App → DiaryView → { Composer, EntryList → EntryRow → EntryContent }`
    (see `design.md` "Component tree"). Both intermediate components
    are pure prop pass-throughs and BOTH must be edited:
    - `src/components/DiaryView.tsx`: add `selectedDate: string | null`
      and `onDateClick: (date: string) => void` to `DiaryViewProps`,
      pass both down to `<EntryList>`. (No Composer change here — the
      composer's popover is self-contained local state, T16.)
    - `src/components/EntryList.tsx`: add the same two props to
      `EntryListProps`, pass `selectedDate` straight through and wrap
      the callback the same way it already wraps tags:
      `onDateClick={(date, e) => props.onDateClick(date)}`.
    Signature chain, mirroring the existing tag chain exactly:
    `EntryContent`/`EntryRow` take `(date: string, e: React.MouseEvent)`;
    `EntryList`/`DiaryView`/`App.handleDateClick` take `(date: string)`.
    Also note `Composer` only renders when `mode === 'all'`, so the
    composer date-picker shorthand is unreachable while any tag/date
    filter or search is active — same as today for the composer
    generally; not a regression, but say so in the docs (T18).
13. `src/components/LeftRail.tsx`: add a second list, "Browse by
    date", **below the existing "Browse by tag" section — confirmed
    placement, not a judgment call.** New props:
    `selectedDate: string | null`, `onDateClick: (date: string) => void`.
    Compute `dateCounts: Record<string, number>` via the same
    per-section scan loop as `tagCounts`, calling
    `parseSectionDate(section)` per section, skipping `null`. Sort
    entries **date-desc** (ISO strings sort correctly lexicographically
    — no need for `Date` parsing to sort), NOT count-desc (tag list's
    sort is unaffected, unchanged). Render each as a button showing
    `formatDateWithYear(date)` + count, `selected` class when
    `props.selectedDate === date`, `onClick={() => props.onDateClick(date)}`.
14. `src/components/ArchiveView.tsx`: **no code change**. It already
    renders `<EntryContent interactive={false} />`, so a section's
    date pill renders as the non-interactive `<span>` variant
    automatically (same reasoning as the entry-level-hashtags plan's
    "no code change" for this file) — covered by a new regression test
    only, per CLAUDE.md's "test over manual check" preference.
15. **Editor popover** (new, isolated code — no existing precedent).
    The utilities below are textarea-agnostic (take a ref/value/caret
    position, know nothing about "edit mode" vs. "composer") so they
    plug into both `EntryRow.tsx`'s edit textarea and `Composer.tsx`'s
    new-entry textarea identically:
    - `src/lib/dateTrigger.ts`: `detectDateTrigger(text: string, caretPos: number): { start: number } | null`.
      Looks backward from `caretPos` for a run of digits immediately
      preceded by `@`, immediately preceded by start-of-text or
      whitespace: test `/(?:^|\s)@\d+$/` against `text.slice(0, caretPos)`;
      if it matches, `start` = index of the `@` character. Returns
      `null` if the character right after `@` was ever a non-digit
      (bare `@mention`/email — never triggers), or if there's no `@`
      run ending exactly at the caret.
    - `src/lib/caretPosition.ts`: `getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): { top: number; left: number; height: number }`.
      Standard "mirror div" technique: create a hidden `<div>`,
      copy the textarea's computed font/box/whitespace CSS properties
      onto it, set its text content to `textarea.value.slice(0, position)`
      plus a marker `<span>`, measure the marker's `offsetTop`/`offsetLeft`,
      add the textarea's own bounding-rect offset and scroll offset,
      remove the mirror div. Pixel-exact behavior is not meaningfully
      testable under jsdom (no real layout engine) — tests assert the
      function's contract (shape of return value, no throw, monotonic
      behavior for increasing `position` on multi-line text via a
      stubbed/mocked layout) rather than exact pixel values; a manual
      check via `./start.sh` is the real verification (documented in
      T17, not gating).
    - `src/components/DateTokenPopover.tsx`: props
      `{ anchor: { top: number; left: number }; onSelect: (iso: string) => void; onDismiss: () => void }`.
      Renders an absolutely-positioned container at `anchor` containing
      a native `<input type="date" autoFocus>`. `onChange` calls
      `onSelect(e.target.value)` (native input already yields
      `YYYY-MM-DD`) — but **guard `if (!e.target.value) return;`**: a
      native date input fires `change` with an empty string while the
      user is part-way through picking (or when they clear it), and
      splicing `@` + `''` would corrupt the text. `Escape` keydown
      calls `onDismiss()`.
      Also expose a `containerRef` (or `forwardRef`) on the outer
      element — the blur-guard below needs to ask "is
      `e.relatedTarget` inside the popover?".
      **Do not** dismiss on the date input's own `blur`: in several
      browsers, opening the native calendar dropdown blurs the input,
      which would close the popover before the user can pick. Dismiss
      on `Escape`, on a successful select, and via the owning
      component when `detectDateTrigger` stops matching.
    - **Wiring pattern (applied twice — once per textarea, T15 for
      `EntryRow.tsx`, T16 for `Composer.tsx`)**: track local state
      `datePopover: { start: number; end: number; anchor: {top,left} } | null`
      in the component that owns the textarea. **`end` (the caret
      position at trigger time, i.e. just past the last typed digit)
      is required and was missing from the earlier draft** — the
      splice needs both ends of the `@`+digits run, and by the time
      the user picks a date the textarea has lost focus so
      `selectionStart` is no longer a reliable source. Store `end` on
      every trigger re-detection (it advances as more digits are
      typed). On the textarea's
      `onChange`, after calling the existing text-change callback
      (`props.onEditTextChange` for `EntryRow`, `props.onTextChange`
      for `Composer`), run `detectDateTrigger(newText, caretPos)`
      (caret position from `e.target.selectionStart`); if it returns
      non-null, compute the anchor via `getCaretCoordinates` at the
      trigger's `@` index and open/update `datePopover`; if it returns
      `null` and a popover was open, close it. On
      `DateTokenPopover.onSelect(iso)`: splice `text.slice(0,
      datePopover.start) + '@' + iso + text.slice(datePopover.end)`,
      call the text-change callback with the spliced text, close the
      popover, refocus the textarea and move its caret to just after
      the inserted token (`start + 1 + iso.length`) via
      `setSelectionRange` — do this in the same tick *after* focus,
      and note the caret must be set after React re-renders with the
      new `value`, so wrap it in a `requestAnimationFrame`/`useEffect`
      keyed on a pending-caret state rather than calling it inline.
      On `onDismiss` (Escape): close the popover and refocus the
      textarea too, otherwise focus is stranded on a removed node.
    - **Blur-guard (load-bearing subtlety, needed in BOTH textareas)**:
      each textarea's existing `onBlur` (`props.onEditSave` in
      `EntryRow`, `props.onBlur` → `handleComposerBlur` in `Composer`)
      would otherwise fire the instant focus moves into the popover's
      native date input — for `EntryRow` that prematurely saves and
      exits edit mode; for `Composer` it's worse, it would prematurely
      **create a brand-new entry** from whatever partial text is in the
      draft (`handleComposerBlur` creates an entry whenever trimmed
      text is non-empty). Fix in both places: wrap the textarea's
      `onBlur` and skip the real handler when **either** of these
      holds:
      1. `datePopover !== null` (a popover is currently open) — this
         is the primary, robust guard; and
      2. `e.relatedTarget` is contained in the popover container
         (`popoverRef.current?.contains(e.relatedTarget as Node)`).
      Guard (1) is not redundant: `relatedTarget` is `null` in several
      real focus transitions (and in `fireEvent.blur` without an
      explicit `relatedTarget`), and a `null` `relatedTarget` would
      otherwise read as "focus went elsewhere" and fire the save/create.
      Only call the real blur/save/create handler when no popover is
      open and focus genuinely left (or after the popover has been
      dismissed/committed and focus returned to the textarea, which
      then blurs normally on a *subsequent* real blur).
16. **Composer wiring is in scope** (this was previously going to be
    excluded — corrected per explicit direction). `Composer.tsx` gets
    the identical trigger/popover/blur-guard treatment as `EntryRow.tsx`'s
    edit textarea (T16, depends on the same `dateTrigger.ts`/
    `caretPosition.ts`/`DateTokenPopover.tsx` utilities from T13/T14).
    `Composer.tsx`'s textarea is structurally the same shape as
    `EntryRow.tsx`'s edit textarea — controlled `value`/`onChange`/
    `onBlur`, its own local `ref`, `useAutoGrowTextarea` — so the same
    utilities apply with no adaptation needed beyond swapping which
    callback prop gets called. See T16 and the Open Questions section
    below for the one nuance this introduces (the higher-stakes
    blur-guard failure mode: creating a bogus entry vs. re-saving one).

## Non-goals / Out of scope

- No IndexedDB schema change, no migration.
- No change to `splitParts`/`extractTags` (tag-only parsing stays as-is).
- No "sections without a date" pseudo-bucket, anywhere.
- No dedicated "edit this date" click affordance on the pill — editing
  a date means editing the underlying text.
- No changes to `filterEntries`'s or `filterParagraphsInEntry`'s
  `'search'`/`'all'` branches beyond the new trailing param threading
  through (search-dominant precedence unchanged; `selectedTags`/`selectedDate`
  are both ignored while searching, exactly as `selectedTags` alone is
  today).
- No dedupe/merge of multiple valid date tokens in one section beyond
  "first wins" — later ones are inert text, never shown as a second pill.
- No exact-pixel-position test for the caret mirror-div utility (jsdom
  layout limitation, documented above) — contract-level tests only,
  manual visual check supplements.

## Files touched

- `src/lib/tags.ts` — add `findAcceptedDateToken`, `parseSectionDate`,
  `splitPartsWithDate`; extend `Part` with optional `isDate?: boolean`.
- `src/lib/dateUtils.ts` — add `formatDateWithYear`.
- `src/lib/mode.ts` — `deriveMode` gains `selectedDate` param; doc
  comment update.
- `src/lib/entryFiltering.ts` — `filterEntries` +
  `filterParagraphsInEntry` gain `selectedDate` param + AND semantics
  + the `selectedTags.length === 0` guard fix.
- `src/lib/dateTrigger.ts` — new file, `detectDateTrigger`.
- `src/lib/caretPosition.ts` — new file, `getCaretCoordinates`.
- `src/components/DateTokenPopover.tsx` (+ `.css`) — new component,
  shared by both `EntryRow.tsx` and `Composer.tsx`.
- `src/components/EntryContent.tsx` — per-section `acceptedIso` +
  emitted-flag, date-pill rendering, `onDateClick` prop.
- `src/components/EntryRow.css` — `.date-pill` / `.date-pill-text`
  rules (alongside the existing `.tag-link`; EntryContent has no
  stylesheet of its own).
- `src/components/EntryRow.tsx` — read-mode: thread `selectedDate`/`onDateClick`;
  edit-mode: trigger detection, popover wiring, blur-guard.
- `src/components/DiaryView.tsx` — pass-through `selectedDate`/`onDateClick`.
- `src/components/EntryList.tsx` — pass-through `selectedDate`/`onDateClick`.
- `src/components/Composer.tsx` — trigger detection, popover wiring,
  blur-guard (mirrors `EntryRow.tsx`'s edit-mode wiring).
- `src/components/LeftRail.tsx` — "Browse by date" list (below the tag
  list), `selectedDate`/`onDateClick` props.
- `src/App.tsx` — `selectedDate` state, `handleDateClick` (toggle),
  thread through `deriveMode` (line 211), `filterEntries` (line 214),
  `<LeftRail>` (line ~951) and `<DiaryView>` (line ~966) — NOT
  `<EntryRow>`, which App does not render directly.
- `src/__tests__/tags.test.ts` — extend.
- `src/__tests__/dateUtils.test.ts` — extend.
- `src/__tests__/mode.test.ts` — extend.
- `src/__tests__/entryFiltering.test.ts` — extend.
- `src/__tests__/EntryContent.test.tsx` — extend.
- `src/__tests__/App.test.tsx` — extend (new toggle-behavior test).
- `src/__tests__/LeftRail.test.tsx` — new file (confirmed: does not
  currently exist in this repo despite a prior plan's stated intent to
  create one).
- `src/__tests__/ArchiveView.test.tsx` — extend (regression only, no
  prod code change to `ArchiveView.tsx`).
- `src/__tests__/caretPosition.test.ts` — new file.
- `src/__tests__/dateTrigger.test.ts` — new file.
- `src/__tests__/DateTokenPopover.test.tsx` — new file.
- `src/__tests__/EntryRow.test.tsx` — new file (confirmed: does not
  currently exist).
- `src/__tests__/Composer.test.tsx` — new file (confirmed: does not
  currently exist).
- `product-behavior.md`, `design.md`, `AGENTS.md`, `CLAUDE.md` — doc updates.
- `plans/section-dates.md` — this plan file, committed alongside the code.

## Task List

Each task ≤30 min. Deps noted as `depends: T#`.

---

### T0 — Create isolated git worktree

No deps.

- From repo root: `git worktree add ../worktree-section-dates -b section-dates/date-tags`
- `cd ../worktree-section-dates`
- `npm install` (worktrees don't share `node_modules`, it's gitignored).
- Acceptance: `npm test` runs clean (baseline pass, no code changes yet).

---

### T1 — Read current source + confirm insertion points

depends: T0

- Re-read in full (in the worktree copy): `src/lib/tags.ts`,
  `src/lib/entryFiltering.ts`, `src/lib/mode.ts`, `src/lib/dateUtils.ts`,
  `src/components/EntryContent.tsx`, `src/components/EntryRow.tsx`,
  `src/components/EntryRow.css`, `src/components/DiaryView.tsx`,
  `src/components/EntryList.tsx`,
  `src/components/Composer.tsx`, `src/components/LeftRail.tsx`,
  `src/components/ArchiveView.tsx`, relevant slices of `src/App.tsx`
  (`selectedTags` state line 68, `handleComposerBlur` lines 319-338,
  `handleEditSave`/`handleEntryClickToEdit`/`handleTagClick` lines
  341-383, `deriveMode`/`filterEntries` call sites lines 211-214,
  `<LeftRail>`/`<DiaryView>` JSX lines 951-987).
- Re-read `src/__tests__/tags.test.ts`, `entryFiltering.test.ts`,
  `mode.test.ts`, `EntryContent.test.tsx`, `dateUtils.test.ts`,
  `ArchiveView.test.tsx`, `App.test.tsx` to match existing style/fixtures.
- Confirm (re-verify only if the worktree diverges from what this plan
  assumed): no `LeftRail.test.tsx`, `EntryRow.test.tsx`, or
  `Composer.test.tsx` exists yet (verified against `main`: the 24
  files in `src/__tests__/` do not include them); `Composer.tsx`'s
  textarea is
  controlled the same way as `EntryRow.tsx`'s edit textarea (local
  ref + `useAutoGrowTextarea` + `value`/`onChange`/`onBlur` props) —
  this is the assumption T16 relies on for direct utility reuse.
- No code change. Acceptance: you can point to the exact line/branch
  in each file above where new code will be inserted, and confirm test
  file conventions to match.

---

### T2 — `dateUtils.ts`: add `formatDateWithYear`

depends: T1

- Add `formatDateWithYear(iso: string): string` per Resolved Decision 6.
- Test cases (add to `src/__tests__/dateUtils.test.ts`):
  - `formatDateWithYear('2026-01-05')` → `'Jan 5, 2026'`.
  - `formatDateWithYear('2024-12-31')` → `'Dec 31, 2024'`.
  - `formatDateWithYear('2024-07-01')` → `'Jul 1, 2024'` (no leading
    zero on single-digit day in the human label, even though the ISO
    input has one).
- Acceptance: `npx vitest run src/__tests__/dateUtils.test.ts` green;
  `npm run build` typechecks clean.

---

### T3 — `tags.ts`: add `findAcceptedDateToken` + `parseSectionDate`

depends: T1

- Add `SECTION_DATE_TOKEN_RE`, `isValidCalendarDate`,
  `findAcceptedDateToken`, `parseSectionDate` per Resolved Decisions 1-4.
- Test cases (add to `src/__tests__/tags.test.ts`):
  - `parseSectionDate('meeting @2026-01-05 notes')` → `'2026-01-05'`.
  - `parseSectionDate('@2026-01-05')` → `'2026-01-05'` (token at start
    of section, no preceding whitespace needed).
  - `parseSectionDate('no date here')` → `null`.
  - `parseSectionDate('@2026-13-45 bogus')` → `null` (invalid month/day,
    "simply doesn't parse", not an error).
  - `parseSectionDate('@2026-02-30 impossible')` → `null` (Feb 30 fails
    calendar round-trip).
  - First-wins: `parseSectionDate('@2026-01-05 and also @2026-02-10')` →
    `'2026-01-05'` (leftmost of two valid tokens).
  - Invalid-then-valid: `parseSectionDate('@2026-13-45 then @2026-01-05')` →
    `'2026-01-05'` (the invalid token doesn't block the later valid one
    from being "first").
  - Boundary rejection: `parseSectionDate('foo@2026-01-05')` → `null`
    (`@` not preceded by start-of-text or whitespace).
  - Trailing-digit rejection: `parseSectionDate('@2026-01-051 more')` →
    `null` (extra digit right after — negative lookahead blocks it;
    note this section has no *other* valid token, so the overall
    result is `null`, not a truncated match).
  - Zero-padding required: `parseSectionDate('@2026-1-5 not padded')` →
    `null` (regex requires exactly 2 digits for month/day).
- Acceptance: `npx vitest run src/__tests__/tags.test.ts` green;
  `npm run build` typechecks clean.

---

### T4 — `tags.ts`: add `splitPartsWithDate`

depends: T3

- Add `isDate?: boolean` and `date?: string` to the `Part` interface.
- Add `splitPartsWithDate(text, acceptedIso, alreadyEmitted?)` per
  Resolved Decision 5 (note the explicit `acceptedIso` argument — the
  function must NOT re-derive "first" from the string it's handed).
- Test cases (add to `src/__tests__/tags.test.ts`):
  - `splitPartsWithDate('note @2026-01-05 done', '2026-01-05')` → 3
    parts: text `'note '`,
    `{ text: '@2026-01-05', isTag: false, isDate: true, date: '2026-01-05' }`,
    text `' done'`.
  - Mixed tag + date: `splitPartsWithDate('#work @2026-01-05', '2026-01-05')`
    → tag part then date part, both flagged correctly, no
    cross-contamination.
  - `acceptedIso === null` → no date part at all, even though the
    string contains a syntactically valid token
    (`splitPartsWithDate('@2026-01-05', null)` → one plain-text part).
  - Non-matching `acceptedIso` stays inert:
    `splitPartsWithDate('@2026-02-10', '2026-01-05')` → plain text only
    (this is the markdown-child case: a later child holding a
    different valid-looking token must never become a pill).
  - Duplicate token stays inert: `splitPartsWithDate('@2026-01-05 and @2026-02-10', '2026-01-05')`
    → the SECOND token appears inside a plain-text part, only the
    first is `isDate: true`.
  - Shared emitted-flag across calls: two successive calls with the
    same flag object and the same `acceptedIso` produce a date part
    only on the FIRST call (this is what keeps a split markdown
    children array from emitting two pills for one section).
  - No date present: `splitPartsWithDate('plain #tag text', null)`
    behaves identically to `splitParts('plain #tag text')`.
  - Empty-match fallback parity: `splitPartsWithDate('plain text', null)`
    → `[{ text: 'plain text', isTag: false }]`, matching
    `splitParts`'s no-match fallback.
  - Existing `splitParts` regression: `splitParts('hi #foo bar')`
    still returns the exact same 3 parts as today (unmodified function,
    confirm no accidental shared-state bug from the new module-level
    date regex's `lastIndex`).
- Acceptance: `npx vitest run src/__tests__/tags.test.ts` green;
  `npm run build` typechecks clean.

---

### T5 — `mode.ts`: add `selectedDate` param

depends: T1

- Update `deriveMode` signature and doc comment per Resolved Decision 10.
- Update the one call site in `src/App.tsx` (`deriveMode(searchQuery, selectedTags)`
  → add third arg) — App.tsx doesn't have `selectedDate` state yet
  (added in T9), so for this task pass a literal `null` as a
  placeholder third argument to keep the build green; T9 replaces it
  with real state.
- Test cases (add to `src/__tests__/mode.test.ts`):
  - `deriveMode('', [], null)` → `'all'`.
  - `deriveMode('', [], '2026-01-05')` → `'tag'` (date alone, no tags,
    still filtered mode — NOT `'all'`).
  - `deriveMode('', ['#work'], null)` → `'tag'` (existing behavior
    unchanged).
  - `deriveMode('query', [], '2026-01-05')` → `'search'` (search still
    wins over a selected date, same precedence as over tags).
  - `deriveMode('', ['#work'], '2026-01-05')` → `'tag'` (both active,
    still just `'tag'` mode — the AND logic lives in `entryFiltering.ts`,
    not here).
- Acceptance: `npx vitest run src/__tests__/mode.test.ts` green;
  `npm run build` typechecks clean.

---

### T6 — `entryFiltering.ts`: AND semantics for `selectedDate`

depends: T3, T5

- Import `parseSectionDate` from `./tags`.
- Update `filterEntries` and `filterParagraphsInEntry` per Resolved
  Decision 11 (5th param, default `null`; `tagOk`/`dateOk` AND; the
  `selectedTags.length === 0 ? true : ...` guard fix).
- Test cases (add to `src/__tests__/entryFiltering.test.ts`), use a new
  fixture entry with a dated section, e.g.
  `text: 'Team sync @2026-01-05\n\nRandom note'`:
  - **Bug-revealing test first** (per CLAUDE.md ground rule — write
    this, confirm it fails against the pre-fix guard, then apply the
    guard fix and confirm it passes): `filterEntries([entry], 'tag', [], '', '2026-01-05')`
    → returns the entry (date-only selection, no tags, mode `'tag'`).
    Without the `selectedTags.length === 0 ? true : ...` guard this
    incorrectly returns empty (the pre-existing `.some()` on an empty
    array is always `false`).
  - `filterParagraphsInEntry(entry, 'tag', [], '', '2026-01-05')` →
    returns only the `'Team sync @2026-01-05'` section (date-only
    section-level filter).
  - AND semantics: entry `'Team sync #work @2026-01-05\n\nOther #work'`,
    `filterParagraphsInEntry(entry, 'tag', ['#work'], '', '2026-01-05')` →
    returns ONLY the first section (has `#work` AND the selected date);
    the second section has `#work` but not the date, so it's excluded
    — proving AND, not OR, between tag and date.
  - No-date-selected regression: `filterParagraphsInEntry(entry, 'tag', ['#work'], '', null)` →
    unaffected by the date param, same result as before this feature
    (both sections with `#work` returned, `dateOk` trivially true).
  - `filterEntries` date-only regression on the multi-entry fixture:
    an entry with no dated section at all is excluded when
    `selectedDate` is set and no section matches.
  - Search precedence unchanged: `filterEntries(entries, 'search', [], 'query', '2026-01-05')` —
    `selectedDate` ignored entirely in search mode (mirrors existing
    `selectedTags`-ignored-in-search behavior).
  - Backward-compat: existing 4-arg calls in this file (e.g.
    `filterEntries(mockEntries, 'all', [], '')`) still compile and
    pass unchanged (default `selectedDate = null`).
- Acceptance: `npx vitest run src/__tests__/entryFiltering.test.ts`
  green; `npm run build` typechecks clean.

---

### T7 — `EntryContent.tsx`: render the date pill

depends: T2, T4

- Compute `const acceptedIso = parseSectionDate(section)` per section
  and create a fresh emitted-flag per section; swap `splitParts` →
  `splitPartsWithDate` in `renderTagsInText`, threading both. Add
  `onDateClick` prop. Render `isDate` parts per Resolved Decision 7
  (button + stopPropagation when interactive, span when not),
  `formatDateWithYear(part.date)` for the label.
- Add `.date-pill` / `.date-pill-text` rules to
  `src/components/EntryRow.css`, next to the existing `.tag-link`
  block (~line 128). EntryContent has no stylesheet of its own.
- Test cases (add to `src/__tests__/EntryContent.test.tsx`):
  - Interactive: `<EntryContent text="meet @2026-01-05" interactive onDateClick={fn} />` —
    a `.date-pill` button renders with text `'Jan 5, 2026'` (not the
    raw token); clicking it calls `onDateClick('2026-01-05', event)`
    and does NOT call `onSectionClick`.
  - Non-interactive: same text, `interactive={false}` — renders a
    `.date-pill-text` `<span>`, no `<button>` present, text still
    `'Jan 5, 2026'`.
  - Duplicate token: `<EntryContent text="@2026-01-05 and @2026-02-10" interactive />` —
    exactly ONE `.date-pill` in the DOM (the second token renders as
    plain visible text `@2026-02-10`, not a second pill).
  - Mixed with tag: `<EntryContent text="#work @2026-01-05" interactive onTagClick={fn} onDateClick={fn2} />` —
    both a `.tag-link` and a `.date-pill` render, independently
    clickable, each firing only its own callback.
  - **Markdown-child-split regression (the highest-value new test —
    this is what the `acceptedIso` design exists for)**:
    `<EntryContent text="@2026-01-05 a *b* @2026-02-10" interactive />`
    — remark splits this paragraph into multiple children
    (`'@2026-01-05 a '`, `<em>`, `' @2026-02-10'`), so a naive
    per-child parse yields TWO pills. Assert exactly ONE `.date-pill`,
    labelled `'Jan 5, 2026'`, and that `@2026-02-10` is present as
    plain text.
  - Same case in list form: `<EntryContent text={"- @2026-01-05\n- @2026-02-10"} interactive />`
    — one section, two `<li>` children → still exactly ONE `.date-pill`.
  - Per-section independence: `<EntryContent text={"@2026-01-05 a\n\n@2026-02-10 b"} interactive />`
    — two sections → TWO pills, one per section (confirms the
    emitted-flag is reset per section, not per component).
  - Section-splitting regression (the existing last test in the file,
    `'should split content into separate paragraphs on blank lines'`,
    line ~270 of 28 tests) still passes unmodified.
- Acceptance: `npx vitest run src/__tests__/EntryContent.test.tsx`
  green; `npm run build` typechecks clean.

---

### T8 — `LeftRail.tsx`: "Browse by date" list

depends: T3

- Add `selectedDate`/`onDateClick` props, `dateCounts` computation,
  new "Browse by date" section rendered BELOW the existing "Browse by
  tag" section, per Resolved Decision 13.
- Create `src/__tests__/LeftRail.test.tsx` (new file — confirmed no
  existing one), following the RTL conventions in
  `EntryContent.test.tsx`/`ArchiveView.test.tsx`. `LeftRail` requires
  all of: `entries`, `selectedTags`, `onTagClick`, `selectedDate`,
  `onDateClick`, `archivedCount`, `onSettingsClick`, `onArchiveClick`,
  `onAboutClick`, `onSwitchProjectClick`, `isMobile`, `isOpen` — pass
  `vi.fn()` for callbacks.
- Test cases:
  - Entries with dated sections `'note @2026-01-05'` and
    `'other @2026-01-05 stuff'` and `'later @2026-02-01'` → date list
    shows two entries: `2026-02-01` (count 1) listed BEFORE
    `2026-01-05` (count 2) — date-desc order, not count-desc.
  - DOM order: the "Browse by date" section's container appears AFTER
    the "Browse by tag" section's container in the rendered output
    (asserts the confirmed below-tags placement, not just that both
    exist).
  - Entry with no dated sections at all → dates list either omits it
    (no crash) and doesn't add any bogus `null` bucket.
  - Clicking a date button calls `onDateClick('2026-01-05')`.
  - `selected` class (or equivalent) applied when `props.selectedDate`
    matches the rendered date.
  - Existing "Browse by tag" list/count behavior unaffected (regression
    — reuse a case similar to what T5 of `tags-entry-level-hashtags.md`
    would have covered: tag counts unaffected by presence of dates in
    the same sections).
- Acceptance: `npx vitest run src/__tests__/LeftRail.test.tsx` green;
  `npm run build` typechecks clean.

---

### T9 — `App.tsx`: wire `selectedDate` state + handlers

depends: T6, T8

- Add `selectedDate` state, `handleDateClick` per Resolved Decision 9.
- Replace the T5 placeholder `null` literal in the `deriveMode(...)`
  call with real `selectedDate` state; add `selectedDate` as 5th arg
  to the `filterEntries(...)` call (T6's default param covers any
  other unchanged call sites).
- Pass `selectedDate`/`onDateClick={handleDateClick}` to `<LeftRail>`
  **and to `<DiaryView>`** (Resolved Decision 12b); this task now also
  covers the `DiaryView.tsx` + `EntryList.tsx` pass-through edits,
  since without them `EntryRow` (T10) has nothing to receive.
- **Toggle-behavior test** (new — extend `src/__tests__/App.test.tsx`):
  the existing file has exactly one test and mocks `entriesRepo`,
  `metaRepo`, and `projectRegistry`; the new test must supply the same
  mock set (`metaRepo.getFilterRules`/`setFilterRules`/
  `getFilterSyncState`/`getDriveMeta`, `entriesRepo.listAllEntries`,
  `entriesRepo.countArchivedEntries`) and set
  `window.location.hash = '#/project/proj-test'` in `beforeEach` as it
  already does. Render `<App>` with a mocked entry containing a dated
  section (e.g.
  `'note @2026-01-05'`), find/click the corresponding date item in the
  left rail's "Browse by date" list, assert the entry list filters down
  to just that date; click the SAME date item again, assert the filter
  clears back to showing all entries (`selectedDate` toggled back to
  `null`) — this is the first automated coverage of `handleDateClick`'s
  toggle behavior end-to-end.
- Acceptance: `npx vitest run src/__tests__/App.test.tsx` green;
  `npm run build` typechecks clean; existing `App.viewSwitch.test.tsx`
  still passes unmodified (confirms no regression from the new
  state/prop wiring).

---

### T10 — `EntryRow.tsx`: read-mode `selectedDate`/`onDateClick` threading

depends: T6, T7, T9

- Add `selectedDate: string | null` and `onDateClick: (date: string, e: React.MouseEvent) => void`
  props to `EntryRowProps`. Pass `selectedDate` as the 5th arg to the
  existing `filterParagraphsInEntry(...)` call (read-mode branch).
  Pass `onDateClick` through to each `<EntryContent>` in the read-mode
  render.
- **Correction to the earlier draft**: `App.tsx` does not render
  `<EntryRow>`. The new props arrive via
  `App → DiaryView → EntryList → EntryRow`; the `DiaryView.tsx` and
  `EntryList.tsx` pass-throughs land in T9. Here, only update the
  `<EntryRow ...>` JSX inside `src/components/EntryList.tsx`
  (`selectedDate={props.selectedDate}`,
  `onDateClick={(date, e) => props.onDateClick(date)}`, mirroring the
  existing `onTagClick` wrapper on line 38).
- No new dedicated test file yet (T15/T17 cover `EntryRow` more fully
  once the edit-mode popover half lands) — this task's read-mode-only
  change is verified by extending `src/__tests__/EntryContent.test.tsx`-style
  coverage already done in T7 and the end-to-end left-rail click test
  in T9; defer the automated `EntryRow`-level test to T15 (which needs
  the file created anyway for the popover half, so it's more efficient
  to write one `EntryRow.test.tsx` there covering both read-mode
  pill-click wiring and edit-mode popover behavior, rather than
  create/extend twice).
- Acceptance: `npm run build` typechecks clean; `npm test` still green
  (no regressions to any currently-passing suite).

---

### T11 — `ArchiveView.tsx` non-interactive pill regression test

depends: T7

Per CLAUDE.md, prefer a test over a manual check. No production code
change to `ArchiveView.tsx`.

- Extend `src/__tests__/ArchiveView.test.tsx`: create an archived
  entry with text containing a dated section (e.g.
  `'Retro @2026-01-05'`), render `<ArchiveView>`, wait for it to load,
  assert a `.date-pill-text` `<span>` is present (not a `.date-pill`
  `<button>`) showing `'Jan 5, 2026'` — confirming archived dates
  render but are non-interactive, mirroring the existing non-interactive
  tag treatment there.
- Acceptance: new test passes; if a visual regression is found, stop
  and flag it as a bug requiring a new task (per the entry-level-hashtags
  plan's precedent), not a silent fix here.

---

### T12 — `caretPosition.ts`: mirror-div caret coordinate utility

depends: T1

- Add `getCaretCoordinates(textarea, position)` per Resolved Decision 15.
- Create `src/__tests__/caretPosition.test.ts`. Given jsdom's lack of
  real layout, test the CONTRACT, not pixel-perfect values:
  - Returns an object with numeric `top`, `left`, `height` for a
    simple single-line textarea + `position = 0`.
  - Does not throw for `position` at the very end of the text, or for
    an empty textarea (`value = ''`, `position = 0`).
  - Cleans up after itself: no leftover mirror `<div>` in `document.body`
    after the call returns (assert `document.body.children` count
    unchanged before/after).
  - Does not mutate the textarea's own DOM attributes/styles as a side
    effect (snapshot `textarea.style.cssText` before/after).
- Acceptance: `npx vitest run src/__tests__/caretPosition.test.ts`
  green; `npm run build` typechecks clean. Note in the task write-up
  (commit message context, not a blocking gate) that real
  pixel-accuracy needs the manual check in T17.

---

### T13 — `dateTrigger.ts`: trigger-detection pure function

depends: T1

- Add `detectDateTrigger(text, caretPos)` per Resolved Decision 15.
- Create `src/__tests__/dateTrigger.test.ts`:
  - `detectDateTrigger('@1', 2)` → `{ start: 0 }` (start-of-text `@`
    immediately followed by a digit, caret right after the digit).
  - `detectDateTrigger('note @2', 7)` → `{ start: 5 }` (`@` preceded by
    a space).
  - `detectDateTrigger('note @20', 8)` → `{ start: 5 }` (trigger stays
    "active" as more digits are typed after the initial one).
  - `detectDateTrigger('email@2', 7)` → `null` (`@` preceded by a
    letter, not whitespace/start — must never trigger on
    email-like/mention-like text).
  - `detectDateTrigger('note @j', 7)` → `null` (`@` followed by a
    letter, not a digit — classic `@mention` case, never triggers).
  - `detectDateTrigger('note @2 more', 12)` → `null` (caret has moved
    past the digit run to later text — trigger is only "live" while
    the caret sits immediately after the digit run).
  - `detectDateTrigger('bare @', 6)` → `null` (`@` with no digit typed
    yet — nothing to trigger on).
  - `detectDateTrigger('', 0)` → `null` (empty text, no crash).
- Acceptance: `npx vitest run src/__tests__/dateTrigger.test.ts`
  green; `npm run build` typechecks clean.

---

### T14 — `DateTokenPopover.tsx` component

depends: T2, T12

- Create the component per Resolved Decision 15 (native
  `<input type="date">`, absolutely positioned at `props.anchor`,
  `onSelect`/`onDismiss` callbacks). This component is shared —
  T15 (`EntryRow.tsx`) and T16 (`Composer.tsx`) both render it.
- Create `src/__tests__/DateTokenPopover.test.tsx`:
  - Renders an `<input type="date">` inside the popover container.
  - Container is positioned via inline style using `props.anchor.top`/`.left`
    (assert the style values reflect the prop, not exact px conversion
    rules beyond what's implemented).
  - Selecting a date (`fireEvent.change(input, { target: { value: '2026-01-05' } })`)
    calls `onSelect('2026-01-05')`.
  - A change event with an EMPTY value
    (`fireEvent.change(input, { target: { value: '' } })`) does NOT
    call `onSelect` — native date inputs fire `change` with `''`
    mid-pick, and splicing `'@' + ''` would corrupt the text.
  - Pressing `Escape` on the input calls `onDismiss()` and not `onSelect`.
  - Rendered popover has `autoFocus` on the date input (assert
    `document.activeElement` is the input after mount, jsdom supports
    this for autoFocus).
- Acceptance: `npx vitest run src/__tests__/DateTokenPopover.test.tsx`
  green; `npm run build` typechecks clean.

---

### T15 — `EntryRow.tsx` edit-mode: wire trigger + popover + blur-guard

depends: T13, T14, T10

- Implement the edit-mode wiring per Resolved Decision 15's wiring
  pattern + blur-guard bullets, for the edit textarea specifically
  (`props.onEditTextChange`/`props.onEditSave`).
- Create `src/__tests__/EntryRow.test.tsx` (new file — confirmed none
  exists). Cover BOTH halves of this feature at the `EntryRow` level
  (read-mode pill click from T10 + edit-mode popover from this task),
  since this is the first dedicated test file for the component:
  - Read-mode: render non-editing `<EntryRow>` with a dated section,
    click the `.date-pill`, assert `onDateClick` fires with the right
    ISO string (integration-level confirmation of T7+T10's wiring).
  - Edit-mode, typing `@` then a digit in the textarea opens the
    popover (assert `DateTokenPopover`'s date `<input>` appears in the
    DOM) — simulate via `fireEvent.change` with the caret at the right
    `selectionStart`/`selectionEnd`.
  - Edit-mode, typing `@` then a letter does NOT open the popover.
  - Selecting a date in the popover splices `@2026-01-05` into the
    textarea's value at the trigger position, replacing exactly the
    `@` + any digits typed so far, and calls `onEditTextChange` with
    the spliced full text.
  - **Blur-guard test** (the load-bearing one): after the popover
    opens, simulate focus moving from the textarea to the popover's
    date input (`fireEvent.blur(textarea, { relatedTarget: dateInput })`)
    — assert `onEditSave` is NOT called (edit mode stays open). Also
    assert the same for `fireEvent.blur(textarea)` with NO
    `relatedTarget` while the popover is open (the `null`-relatedTarget
    case that guard (1) in Resolved Decision 15 exists for; a
    relatedTarget-only guard fails this one). Then
    simulate a real blur to somewhere outside the popover — assert
    `onEditSave` IS called normally (existing save-on-blur behavior
    preserved for the non-popover case).
  - Escape while the popover is open closes it without calling
    `onEditSave` or `onEditTextChange`.
- Acceptance: `npx vitest run src/__tests__/EntryRow.test.tsx` green;
  `npm run build` typechecks clean.

---

### T16 — `Composer.tsx`: wire trigger + popover + blur-guard

depends: T13, T14, T1

- Implement the same wiring pattern as T15, applied to `Composer.tsx`'s
  new-entry textarea (`props.onTextChange`/`props.onBlur` →
  `handleComposerBlur` in `App.tsx`). No read-mode half here — the
  composer has no rendered pills/filter concept, only the trigger +
  popover + splice + blur-guard mechanics.
- Create `src/__tests__/Composer.test.tsx` (new file — confirmed none
  exists):
  - Typing `@` then a digit in the composer textarea opens the popover
    (same simulation approach as T15's edit-mode test).
  - Typing `@` then a letter does NOT open the popover (mention/email
    false-positive case, same as T15).
  - Selecting a date in the popover splices `@2026-01-05` into the
    composer's text at the trigger position and calls
    `props.onTextChange` with the spliced text.
  - **Blur-guard test (higher-stakes variant)**: after the popover
    opens, simulate focus moving from the composer textarea to the
    popover's date input — assert `props.onBlur` is NOT called (which
    means `handleComposerBlur` in the real app would not fire, so no
    premature entry gets created from partial draft text). Repeat with
    a blur carrying NO `relatedTarget` while the popover is open —
    also must not call `props.onBlur`. Then
    simulate a real blur to somewhere outside the popover — assert
    `props.onBlur` IS called normally (existing create-on-blur
    behavior preserved for the non-popover case).
  - Escape while the popover is open closes it without calling
    `props.onBlur` or `props.onTextChange`.
- Acceptance: `npx vitest run src/__tests__/Composer.test.tsx` green;
  `npm run build` typechecks clean.

---

### T17 — Full suite + build check (+ manual visual pass)

depends: T9, T10, T11, T15, T16

- Run `npm run build` (typecheck + build) — must pass.
- Run `npm test` — full suite must pass, including every new/extended
  test file from T2-T16.
- Manual check (per CLAUDE.md, supplementary — not a substitute for
  the automated tests already added, but the mirror-div popover
  positioning genuinely needs eyes on it): `./start.sh`. In the running
  app (note the composer only renders in mode `'all'`, so clear any
  tag/date filter and the search box before step 2): (1) click into an
  entry to edit it, type `@` then a digit,
  confirm the popover appears near the caret, pick a date, confirm the
  token splices in and the entry saves on a real blur afterward; (2) in
  the empty composer at the top, do the same — type `@` + digit, pick
  a date, confirm the token splices into the draft and a new entry is
  created on blur with the dated section intact; (3) confirm sections
  render the date pill, click one, confirm the left rail highlights the
  matching date entry (below the tag list) and the diary view filters
  accordingly; click it again and confirm the filter clears; combine
  with a tag filter to eyeball the AND behavior.
- Acceptance: both commands green; manual pass finds no blocking
  visual/behavioral bug in either textarea. If one is found, stop and
  flag it as a new task — do not silently patch code without adding a
  covering test first (per CLAUDE.md ground rules).

---

### T18 — Update `product-behavior.md`

depends: T17

- "Diary view" section (~line 19-27): add a bullet describing the
  `@YYYY-MM-DD` section-date token — renders as a distinct pill (not
  raw text), clicking it sets a single-select date filter analogous to
  tag click (toggles off on a second click, same as tags), changing/
  removing a date means editing the text directly. Note retroactive/
  automatic (render-time derived, no persisted flag). Also note the
  typed shorthand (`@` + digit opens an inline date picker) works in
  BOTH the edit textarea and the new-entry composer — not edit-only.
  Extend the existing "Tag filter" bullet (or add an adjacent "Date
  filter" bullet) to state selectedTags/selectedDate combine with AND
  semantics per section (search still wins outright over both).
- "Left rail (tag browser)" section (~line 29-33): add a bullet for
  the new "Browse by date" list, listed below the tag list — every
  distinct section date across non-archived entries, with count,
  sorted date-desc (not count-desc). No untagged-style "no date"
  bucket.
- "Archive view" section (~line 35-40): note date pills render there
  too, non-interactively, same as tags.
- Keep terse, bullet style, matching existing tone.
- Acceptance: section reads accurately against shipped behavior; no
  stale implication that all filtering/browsing is tag-only, and none
  implying the date-picker shorthand only works while editing an
  existing entry.

---

### T19 — Update `design.md`

depends: T17

- "Directory structure" section (line 5): add `src/lib/dateTrigger.ts`,
  `src/lib/caretPosition.ts`, `src/components/DateTokenPopover.tsx`.
- "Component tree" section (line 31): add `DateTokenPopover` under both
  `Composer` and `EntryRow` (edit mode), and update the
  `EntryRow × N → EntryContent (renders parsed tag/text parts)` line
  to mention date parts.
- "State management" section (line 51): extend the "UI filters" bullet
  — `selectedTags`, `selectedDate`, `searchQuery` → `mode` →
  `filteredEntries`. Note the popover state (`datePopover`) is
  component-local in `EntryRow`/`Composer`, not in `App.tsx` — a
  deliberate exception to the "all state in App.tsx" pattern.
- "Data flows" section (~line 84-91): extend the "Filter/search"
  bullet — `deriveMode`/`filterEntries`/`filterParagraphsInEntry` now
  also take `selectedDate`; note the AND-combination point. Add a
  bullet for the new editor-popover flow: EITHER textarea's `onChange`
  (edit textarea in `EntryRow.tsx`, or the new-entry textarea in
  `Composer.tsx`) → `detectDateTrigger` (`src/lib/dateTrigger.ts`) → if
  triggered, `getCaretCoordinates` (`src/lib/caretPosition.ts`)
  positions the shared `DateTokenPopover` → selecting a date splices
  the `@YYYY-MM-DD` token into that textarea's own text state, same
  save/create flow as a normal edit/new-entry blur.
- "Design patterns" section (~line 93-98): note where the new parser
  lives (`findAcceptedDateToken`/`parseSectionDate`/`splitPartsWithDate`
  in `src/lib/tags.ts`), and that the caret-popover utilities
  (`caretPosition.ts`, `dateTrigger.ts`, `DateTokenPopover.tsx`) are new,
  isolated, single-purpose modules shared by two independent callers
  (`EntryRow.tsx` and `Composer.tsx`) — not owned by either one.
- Acceptance: no stale/contradicted content, terse, consistent with
  the rest of the file's style; nothing implies the popover is
  edit-only.

---

### T20 — Update `AGENTS.md` + `CLAUDE.md` "Tags and filtering"

depends: T17

- Both files carry a near-identical "Tags and filtering" section
  (~line 43-46 in each) — CLAUDE.md's ground rules require updating
  both, kept in sync (same pattern as T8b in
  `plans/tags-entry-level-hashtags.md`).
- Add bullets covering: the new `@YYYY-MM-DD` section-date token
  (parsed at render time in `src/lib/tags.ts`, never persisted, "first
  valid token wins" per section); the new `selectedDate` single-select
  filter state in `App.tsx` (toggle behavior, same as tags) that ANDs
  with `selectedTags` (both ignored during search, same precedence as
  today); the new isolated caret-popover utility modules and that they
  are wired into both the edit textarea (`EntryRow.tsx`) and the
  composer textarea (`Composer.tsx`).
- Acceptance: both files updated identically in substance; no other
  section drift.

---

### T21 — Full-file review of reference docs

depends: T18, T19, T20

- Per CLAUDE.md "Full-file review after major changes" (this is a
  behavior/feature shift, not a trivial edit): re-read
  `product-behavior.md` in full and `design.md` in full.
- Check: no inconsistencies across sections (e.g. "Tag filter" bullet
  vs. new "Date filter" bullet don't contradict each other on
  precedence), no stale/contradicted content, accurate to code as it
  now stands, still token-optimized (terse, no redundancy, no
  narrative drift). In particular, confirm nothing anywhere still says
  or implies the popover is edit-mode-only.
- Fix any issues found before proceeding.
- Acceptance: both files pass this review with no outstanding fixes.

---

### T22 — Commit

depends: T21

- `git add` the specific changed files listed under "Files touched"
  above (all `src/lib/*`, `src/components/*` including `Composer.tsx`,
  `DiaryView.tsx`, `EntryList.tsx`, `EntryRow.css`,
  `src/App.tsx`, all listed test files including `Composer.test.tsx`,
  `product-behavior.md`, `design.md`, `AGENTS.md`, `CLAUDE.md`,
  `plans/section-dates.md`). Do NOT `git add -A`.
- Commit message describing the "why" (lets an author stamp an
  individual paragraph with a date via an inline `@YYYY-MM-DD` token,
  filterable alongside tags, typeable via an inline date picker in
  either the composer or edit mode, without any schema change), not
  just "what". Include the retroactive-behavior callout.
- Acceptance: `git status` in the worktree shows no modified/untracked
  files left over; `npm test` and `npm run build` green on the commit.

---

### T23 — Tear down worktree

depends: T22

- Confirm with the user first: local merge vs. push + PR (this plan
  does not resolve it; prior plans in this repo mostly end with a
  local merge — see `61586b9 Merge branch 'project-picker-drive-discovery/main'`
  on `main`).
- **`main` cannot be checked out inside the worktree** — it's already
  checked out in the primary worktree. Order matters:
  1. `cd /Users/mdoraiswamy/work/notesdiary/app` (primary worktree,
     on `main`).
  2. Local-merge path: `git merge section-dates/date-tags`. PR path
     instead: from the worktree (before removing it), `git push -u
     origin section-dates/date-tags` then `gh pr create`, and skip
     the merge.
  3. `git worktree remove ../worktree-section-dates` (must not be run
     from inside the worktree).
- Acceptance: `git worktree list` no longer shows the removed
  worktree; the branch still exists with the commit(s); primary
  directory's `git status` is clean.

---

## Test Strategy Summary

- Unit: `parseSectionDate`/`findAcceptedDateToken` correctness
  (calendar validity, first-wins, boundary/padding edge cases) — T3.
- Unit: `splitPartsWithDate` tag/date merge + duplicate-token inertness
  — T4.
- Unit: `formatDateWithYear` — T2.
- Unit: `deriveMode` date-only/combined precedence — T5.
- Unit: `filterEntries`/`filterParagraphsInEntry` AND semantics +
  bug-revealing empty-`selectedTags` guard test — T6.
- Component: `EntryContent` pill rendering (interactive/non-interactive,
  duplicate-token, mixed tag+date) and the markdown-child-split /
  list / multi-section cases that guard the one-pill-per-section
  contract — T7.
- Component: `LeftRail` new dates list (below tags, date-desc sort,
  click wiring), tag-list-unaffected regression — T8.
- Integration: `App.tsx` date-filter toggle-on/toggle-off end-to-end
  — T9.
- Regression: `ArchiveView` non-interactive date pill — T11.
- Unit (contract-level, jsdom-limited): `getCaretCoordinates` — T12.
- Unit: `detectDateTrigger` trigger/no-trigger edge cases (the
  email/mention false-positive cases are the highest-value ones) — T13.
- Component: `DateTokenPopover` render + select/dismiss — T14.
- Integration: `EntryRow` read-mode pill-click wiring + edit-mode
  trigger/splice/blur-guard — T15.
- Integration: `Composer` trigger/splice/blur-guard, including the
  higher-stakes "don't create a bogus entry" blur-guard case — T16.
- Full suite + build + manual visual pass (both textareas) — T17.

## Risks

- Line numbers cited for `product-behavior.md`, `design.md`,
  `AGENTS.md`/`CLAUDE.md` were re-verified accurate against `main`
  (product-behavior.md: Diary view 19, Left rail 29, Archive view 35;
  design.md: Directory structure 5, Component tree 31, State
  management 51, Data flows 84, Design patterns 93; "Tags and
  filtering" at line 43 in both AGENTS.md and CLAUDE.md) but may shift
  by the time T18-T20 run — re-locate named sections by heading text,
  not line number.
- **`EntryContent` renders through `ReactMarkdown`, so the parser
  never sees a whole section at render time.** This is the single
  biggest correctness trap in the feature and the reason
  `splitPartsWithDate` takes an explicit `acceptedIso` plus a
  per-section emitted flag (Resolved Decision 5). A "just swap
  `splitParts` for `splitPartsWithDate`" implementation compiles, ships,
  and silently renders extra date pills that no filter matches. T7's
  markdown-child-split and list tests exist to catch exactly that.
- Related, accepted limitation: because the accepted token is matched
  by ISO value, if a section legitimately contains the *same* date
  token twice, only the first occurrence in render order becomes a
  pill — which is the intended "first wins" behavior anyway.
- Tokens whose `@` is not preceded by whitespace/start-of-string
  (e.g. `(@2026-01-05)`, `-@2026-01-05`) never parse. Accepted; the
  boundary rule exists to avoid matching emails/mentions.
- The blur-guard is the single highest-risk piece of new logic, and it
  now exists in TWO places (`EntryRow.tsx` T15, `Composer.tsx` T16). If
  `e.relatedTarget` handling is wrong: in `EntryRow`, the popover
  becomes unusable (textarea saves and exits edit mode the instant the
  popover opens); in `Composer`, the failure is worse — a bogus entry
  could get created from partial trigger text (e.g. an entry whose
  entire body is `'@2'`) the instant the popover opens. Both dedicated
  blur-guard tests (T15, T16) are not optional.
- `getCaretCoordinates`'s pixel accuracy cannot be meaningfully unit
  tested under jsdom — T17's manual pass (covering both textareas) is
  the only real check on whether the popover visually lands near the
  caret. If it's badly off in practice, that's a follow-up task, not a
  silent tweak.
- Retroactive effect: any pre-existing entry text that happens to
  already contain a syntactically-valid, boundary-satisfying
  `@YYYY-MM-DD` substring becomes a dated section on upgrade — accepted
  by spec, called out in the T22 commit message so it isn't later
  mistaken for a regression.
- `filterEntries`/`filterParagraphsInEntry`'s default `selectedDate = null`
  keeps existing 4-arg call sites compiling, but any FUTURE code that
  calls these with `selectedTags = []` and doesn't also pass a
  meaningful `selectedDate` will silently rely on the new
  `selectedTags.length === 0 ? true : ...` guard's "everything matches
  by tag" behavior — worth a comment in the code itself (not just this
  plan) at the guard site.
- Duplicating the trigger/popover/blur-guard wiring in two components
  (`EntryRow.tsx`, `Composer.tsx`) instead of extracting a shared hook
  is a deliberate choice to keep each task small and independently
  testable — if the two implementations drift (e.g. one gets a bugfix
  the other doesn't), that's a maintainability cost worth revisiting
  post-ship as a small refactor (extract a `useDateTokenTrigger` hook),
  not something this plan does now.

## Open Questions Resolved By Judgment (flag to user)

- **Composer/EntryRow reusability check**: `Composer.tsx`'s textarea
  was confirmed (T1) to be structurally identical in the relevant ways
  to `EntryRow.tsx`'s edit textarea — controlled `value`/`onChange`/
  `onBlur`, its own local ref, `useAutoGrowTextarea` — so
  `detectDateTrigger`/`getCaretCoordinates`/`DateTokenPopover` apply to
  both with no structural adaptation. No blocker found. The one real
  difference is consequence, not structure: `Composer.tsx`'s blur
  handler (`handleComposerBlur`) **creates a brand-new entry** when
  invoked with non-empty text, whereas `EntryRow.tsx`'s blur handler
  merely re-saves an existing one — so an under-guarded blur during
  popover interaction is a worse failure mode in the composer (a bogus
  entry gets created) than in the edit textarea (an existing entry
  gets prematurely re-saved, which is harmless since the text hasn't
  actually changed yet). T16's blur-guard test is written to catch
  this specific failure mode (asserting no entry-creation callback
  fires), not just "onBlur wasn't called" in the abstract.
- No other open questions remain from the original spec interview —
  all three items raised by the coordinator (date-pill toggle
  behavior, left-rail list ordering, Composer scope) are now resolved
  and reflected in the Resolved Decisions section above.
