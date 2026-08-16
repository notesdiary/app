# Plan: Settings Backup-File Download Control

## Overview

Add a download button to each row in the Settings "Backup files" list
(`src/components/SettingsView.tsx`, `.backup-file-row` markup around
lines 588-624). Button sits in `.file-status`, right before the existing
share button. Click opens a tiny inline dropdown with two choices:
"Download as JSON" and "Download as Markdown". Both download 100%
client-side (Blob + temp `<a download>`), no Drive/network call. No new
npm dependency — hand-rolled icon (matches `ShareIcon` style in
`src/components/ShareModal.tsx` lines 72-82) and hand-rolled dropdown.

Content source: `getFilterMatches(rule, allEntries)`, already defined in
`src/App.tsx` lines 260-277. JSON export must byte-for-byte match the
existing Drive backup shape used at `src/App.tsx` line 530:
`JSON.stringify(matches, null, 2)`, bare array, no envelope.

## Resolved Decisions (baked in, not open questions)

1. Scope: one download control per backup-file row (per `FilterRule`),
   same row/scope as share button. Not per-entry, not per-project.
2. Enabled iff `props.filterMatchCounts[rule.id] >= 1` AND
   `rule.fileName.trim()` non-blank (same blank-filename check as
   existing `isSkippable` at `SettingsView.tsx` line 579). NOT gated on
   `driveFileId` or sync status (unlike share button).
3. Architecture: follow existing App.tsx-owns-handlers /
   SettingsView-is-presentational split (see `design.md` "Presentational
   components receive all data and callbacks as props"). Add ONE new
   handler in `App.tsx`, `handleDownloadFilterRule(ruleId, format)`,
   that: looks up the rule, calls `getFilterMatches(rule, entries)`,
   builds the string (JSON or Markdown), builds filename via
   `ensureJsonExtension`-equivalent base-name logic, creates a Blob +
   temp anchor, clicks it, revokes the object URL. Pass it down as a new
   prop `onDownloadFilterRule: (id: string, format: 'json' | 'markdown') => void`.
   SettingsView only renders UI and calls this prop — it does not touch
   `entries` or `getFilterMatches` itself (SettingsView does not
   currently receive raw `entries`, and this plan does not add that
   prop).
4. Filename base: same base name already shown in the row via
   `ensureJsonExtension(rule.fileName)` in `SettingsView.tsx` line 597,
   with a helper that strips whatever extension is there and appends
   `.json` or `.md`. Put this helper in `App.tsx` next to
   `ensureJsonExtension` (or reuse/extend it) — exact call site is
   `SettingsView.tsx` line 59's `ensureJsonExtension`.
5. Markdown shape: for matches sorted newest-date-first then
   newest-time-first within a date:
   ```
   ## YYYY-MM-DD
   **HH:MM** — entry text
   **HH:MM** — entry text

   ## YYYY-MM-DD
   **HH:MM** — entry text
   ```
   One blank line between date groups. Group by `entry.date` (string
   already ISO `YYYY-MM-DD`, so plain string sort descending works,
   no Date parsing needed for date-level sort). Within a group, sort by
   `entry.time` (also `HH:MM` string, sort descending works directly).
6. Icon: new `DownloadIcon` function component in `SettingsView.tsx`,
   inline SVG, 14x14, `#53565A` stroke, download-arrow-into-tray glyph,
   same file/style as `SettingsShareIcon` (`SettingsView.tsx` line 46).
7. Dropdown: component-local state in `SettingsView.tsx`,
   `downloadMenuOpenRuleId: string | null` (one open at a time, same
   pattern as `shareModalOpenFileId`). Close on outside click via a
   `useEffect` + `mousedown` listener checking a ref, OR a simple
   backdrop `<div>` behind the menu that closes on click (repo already
   uses `modal-overlay` click-to-close pattern at `SettingsView.tsx`
   line 634 — reuse that convention, scaled down to a small popover
   rather than a full modal overlay covering the screen). Menu has two
   `<button>`s: "Download as JSON", "Download as Markdown"; clicking
   either calls `props.onDownloadFilterRule(rule.id, format)` and closes
   the menu.
8. No new dependency. Blob/anchor/download attribute only.
9. Tests go in `src/__tests__/` per existing vitest + RTL conventions
   (see e.g. existing `SettingsView`-adjacent tests, or create
   `src/__tests__/settingsDownload.test.tsx` if none exists yet for
   SettingsView-specific behavior — check first before assuming a new
   file name).

## Non-goals / Out of scope

- No changes to Drive sync, `driveFileId`, sync status computation.
- No changes to the share button/`ShareModal`.
- No changes outside Settings backup-files row.
- No new npm dependency.

## Files touched

- `src/App.tsx` — new `handleDownloadFilterRule` handler + filename-ext
  helper; pass new prop to `<SettingsView>`.
- `src/components/SettingsView.tsx` — new `DownloadIcon`, new dropdown
  state + markup in `.file-status`, new prop in `SettingsViewProps`.
- `src/__tests__/*` — new test file(s) for handler logic + component
  behavior.
- `product-behavior.md` — update "Settings — Google Drive backup"
  section (line ~47).
- `design.md` — check/update component tree + data-flow mentions of
  `SettingsView`.

## Task List

Each task ≤30 min. Deps noted as `depends: T#`.

---

### T0 — Create isolated git worktree

No deps.

- From repo root run:
  `git worktree add ../worktree-settings-file-download -b settings-file-download/download-control`
- `cd ../worktree-settings-file-download`
- Run `npm install` if `node_modules` isn't already usable in the new
  worktree (check first, worktrees share the same `node_modules` only
  if not gitignored — for this repo `node_modules` is gitignored, so
  install is needed).
- Acceptance: `npm test` runs clean (baseline pass) inside the new
  worktree before any code changes.

---

### T1 — Read current row markup + confirm prop wiring

depends: T0

- Re-read `src/components/SettingsView.tsx` lines 1-60 (imports,
  `SettingsViewProps`, `SettingsShareIcon`, `ensureJsonExtension`) and
  lines 570-630 (the row markup) in the worktree copy, to confirm line
  numbers didn't shift.
- Re-read `src/App.tsx` lines 255-280 (`getFilterMatches`) and around
  line 860-870 (props passed into `<SettingsView>`, esp.
  `filterMatchCounts`).
- No code change this task — just confirm exact insertion points before
  editing. Write down (in your own scratch notes, not committed) the
  exact prop list of `SettingsViewProps` and the exact JSX prop-passing
  block in `App.tsx` so T2/T3 can edit precisely.
- Acceptance: you can point to the exact line where
  `filterMatchCounts={...}` is passed to `<SettingsView>`, and the exact
  line range of `.file-status` div contents.

---

### T2 — Add `handleDownloadFilterRule` handler + filename helper in App.tsx

depends: T1

- In `src/App.tsx`, add a small helper near `ensureJsonExtension`'s
  usage (or add a local equivalent) that, given `fileName: string` and
  `format: 'json' | 'markdown'`, strips any existing extension and
  returns `base + '.json'` or `base + '.md'`.
- Add `formatEntriesAsMarkdown(matches: Entry[]): string`:
  - Group matches by `entry.date`.
  - Sort group keys descending (string sort works for `YYYY-MM-DD`).
  - Within each group, sort entries by `entry.time` descending (string
    sort works for `HH:MM`).
  - Emit `## <date>\n` then one `**<time>** — <text>` line per entry,
    blank line between groups.
- Add `handleDownloadFilterRule = (ruleId: string, format: 'json' | 'markdown') => void`:
  - Find rule via `filterRules.find(r => r.id === ruleId)`; bail
    (console.error + return) if not found.
  - `const matches = getFilterMatches(rule, entries);`
  - Build content: `format === 'json' ? JSON.stringify(matches, null, 2) : formatEntriesAsMarkdown(matches)`.
  - Build filename via the helper above from `rule.fileName`.
  - Create `new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' })`,
    `URL.createObjectURL`, temp `<a>` with `download = filename`, `href = url`,
    `a.click()`, then `URL.revokeObjectURL(url)` (use a `setTimeout(…, 0)`
    or immediate revoke after click per common browser-safe pattern —
    check that immediate revoke doesn't break Safari; if uncertain,
    revoke on next tick).
  - No `await`, no network call, no touching `driveFileId` /
    `filterSyncState` / `drive` singleton anywhere in this function.
- Pass `onDownloadFilterRule={handleDownloadFilterRule}` into
  `<SettingsView>` alongside existing `filterMatchCounts` prop.
- Test cases (add to a new or existing test file, e.g.
  `src/__tests__/appDownload.test.ts` if handler logic is exported for
  testing, or test via component in T4 — pick whichever matches how
  other `App.tsx`-local handlers are tested in this repo; if `App.tsx`
  handlers are never unit-tested standalone, cover this purely through
  the T4 component test instead and note that decision):
  - JSON output exactly equals `JSON.stringify(getFilterMatches(rule, entries), null, 2)`.
  - Markdown output: 2 entries same date, different times → single
    `## date` heading, both lines present, newer time first.
  - Markdown output: 2 entries different dates → 2 headings, newer
    date first.
  - Filename: `rule.fileName = "foo.json"` + format `markdown` →
    downloaded filename is `foo.md` (not `foo.json.md`).
  - Filename: `rule.fileName = "foo"` (no ext) + format `json` →
    `foo.json`.
  - Handler never calls `drive.*`, never reads/writes
    `filterSyncState`/`driveFileId` (assert via spy/mock or by
    inspection that no such calls occur in the function body).
- Acceptance: `npm run build` typechecks clean; new handler has no
  `await`/promise, confirming it's synchronous/local-only per
  requirement 9 (no Drive/network call).

---

### T3 — Add `DownloadIcon`, dropdown state, and row markup in SettingsView.tsx

depends: T1 (can run in parallel with T2 once T1 is done; needs T2's
final prop name `onDownloadFilterRule` to wire the click handler, so
land T2 first or agree on the prop name up front — prop name is fixed
above as `onDownloadFilterRule`, so this task can start once that name
is settled even before T2's code lands, but merge order should be T2
before T3 to avoid a broken intermediate build)

- Add `DownloadIcon` function component near `SettingsShareIcon`
  (`SettingsView.tsx` line ~46): 14x14 inline SVG, `#53565A` stroke,
  download-arrow-into-tray glyph (arrow pointing down into a horizontal
  tray line — 2-3 `<path>`/`<line>` elements, same minimal style as
  `ShareIcon` in `ShareModal.tsx`).
- Add `onDownloadFilterRule: (id: string, format: 'json' | 'markdown') => void;`
  to `SettingsViewProps` interface (near existing `onSyncFilterRule`).
- Add local state: `const [downloadMenuOpenRuleId, setDownloadMenuOpenRuleId] = useState<string | null>(null);`
  near other `SettingsView` local state.
- In the row markup (`.file-status` div, `SettingsView.tsx` lines
  605-623), insert a new wrapping block BEFORE the existing
  `share-button`:
  ```
  <div className="download-button-wrapper">
    <button
        className="download-button"
        onClick={() => setDownloadMenuOpenRuleId(
          downloadMenuOpenRuleId === rule.id ? null : rule.id
        )}
        disabled={(props.filterMatchCounts[rule.id] || 0) === 0 || !rule.fileName.trim()}
        aria-label="Download backup file"
    >
      <DownloadIcon />
    </button>
    {downloadMenuOpenRuleId === rule.id && (
      <>
        <div className="download-menu-backdrop" onClick={() => setDownloadMenuOpenRuleId(null)} />
        <div className="download-menu">
          <button onClick={() => { props.onDownloadFilterRule(rule.id, 'json'); setDownloadMenuOpenRuleId(null); }}>
            Download as JSON
          </button>
          <button onClick={() => { props.onDownloadFilterRule(rule.id, 'markdown'); setDownloadMenuOpenRuleId(null); }}>
            Download as Markdown
          </button>
        </div>
      </>
    )}
  </div>
  ```
  (`download-menu-backdrop` styled as a fixed full-viewport transparent
  layer just to catch outside clicks, or a simpler doc-level
  `mousedown` listener + ref if that's more consistent with repo
  conventions — check if any existing small popover in the repo uses a
  backdrop-div vs. listener pattern before picking; default to the
  backdrop-div approach shown above since it mirrors the existing
  `modal-overlay` convention already in this file.)
- Add matching CSS to `src/components/SettingsView.css` (or wherever
  `.share-button`/`.backup-file-row` styles live) for
  `.download-button`, `.download-button-wrapper`, `.download-menu`,
  `.download-menu-backdrop` — small popover, absolute-positioned under
  the button, simple border/shadow, no animation library.
- Test cases (`src/__tests__/settingsDownload.test.tsx`, new file,
  RTL + vitest):
  - Renders one download button per row, and it appears before the
    share button in DOM order (query both, compare
    `compareDocumentPosition` or just assert order in the rendered
    row's `.file-status` children).
  - Button `disabled` when `filterMatchCounts[rule.id]` is 0; `enabled`
    when >= 1, REGARDLESS of `driveFileId`/sync state props (render
    with `driveFileId` absent and count >= 1 → still enabled).
  - Clicking button opens dropdown showing both option labels.
  - Clicking outside (the backdrop) closes it.
  - Clicking "Download as JSON" calls
    `props.onDownloadFilterRule(rule.id, 'json')` and closes the menu.
  - Clicking "Download as Markdown" calls
    `props.onDownloadFilterRule(rule.id, 'markdown')` and closes the
    menu.
- Acceptance: `npm test` passes for the new file; `npm run build`
  typechecks clean.

---

### T4 — Integration check: wire T2 handler + T3 UI together, manual sanity run

depends: T2, T3

- Confirm `App.tsx` passes `onDownloadFilterRule={handleDownloadFilterRule}`
  and `SettingsView.tsx` calls it correctly (prop name/signature match).
- Run `npm run build` (full typecheck + build) — must pass.
- Run `npm test` — full suite must pass, including new tests from T2/T3.
- Optional manual smoke check (not required to pass, but recommended):
  run `npm run dev`, open Settings, add/verify a filter rule with
  matches, click download, confirm both JSON and Markdown files
  download with correct content and filename.
- Acceptance: `npm run build` and `npm test` both green.

---

### T5 — Update `product-behavior.md`

depends: T4

- Edit the "Settings — Google Drive backup" section (currently around
  line 41-50). Extend the "Backup files list" bullet (line 47) to
  mention the new download control: a download icon button (enabled
  whenever the rule has >=1 matched entry and a non-blank filename,
  independent of Drive sync state) that opens a small menu offering
  "Download as JSON" (raw entry array, same shape as the Drive backup
  file) or "Download as Markdown" (grouped by date, newest first,
  `**HH:MM** — text` lines, newest time first within a date). State
  clearly this is 100% local/client-side, no Drive/network involved.
- Keep terse, bullet style, matching existing doc tone — no narrative.
- Acceptance: section reads accurately against the shipped behavior;
  no stale references to old row layout order.

---

### T6 — Update `design.md`

depends: T4

- Check `design.md`'s `SettingsView` mentions (component tree section,
  currently listing `SettingsView` → `ShareModal`, and the
  presentational-components-receive-props-from-App.tsx note). Add a
  one-line mention that `SettingsView` also owns local
  `downloadMenuOpenRuleId` state (alongside its existing
  `shareModalOpenFileId`/share state, in whichever sentence already
  lists that), and that `App.tsx` owns `handleDownloadFilterRule` /
  `getFilterMatches`-based export logic (grouped with the existing
  `getFilterMatches`/sync-handler description if one exists).
- Full-file skim of `design.md` after editing (per CLAUDE.md "full-file
  review after major changes") to confirm no contradictions introduced
  — this is a small change so skim is enough, not a deep audit.
- Acceptance: no stale/contradicted content; terse and consistent with
  rest of file.

---

### T7 — Commit

depends: T5, T6

- `git add` the specific changed files (`src/App.tsx`,
  `src/components/SettingsView.tsx`, `src/components/SettingsView.css`
  (or wherever CSS landed), the new test file(s), `product-behavior.md`,
  `design.md`). Do NOT `git add -A`.
- Commit message describing the "why" (adds local export of a backup
  file's matched entries as JSON or Markdown, independent of Drive
  sync), not just "what".
- Acceptance: `git status` clean except for the worktree/branch itself;
  `npm test` and `npm run build` green on the commit.

---

### T8 — Tear down worktree

depends: T7

- From inside the worktree: push the branch if a PR is wanted
  (`git push -u origin settings-file-download/download-control`), or
  merge locally into `main` per user's preference — confirm which
  before doing either (this plan does not resolve PR-vs-direct-merge;
  treat as a checkpoint to ask, default to opening a PR if unsure).
- `cd` back to the original repo directory
  (`/Users/mdoraiswamy/work/notesdiary/app`).
- `git worktree remove ../worktree-settings-file-download`.
- Acceptance: `git worktree list` no longer shows the removed worktree;
  original directory's `git status` unaffected by the removed worktree.

---

## Test Strategy Summary

- Unit-level: JSON/Markdown formatting correctness, filename-extension
  swap correctness — covered in T2.
- Component-level: button placement/order, enabled/disabled gating,
  dropdown open/close, click wiring — covered in T3.
- Integration: full build + full test suite green — covered in T4.
- No E2E/browser automation needed; Blob/anchor download mechanism is
  standard and not itself under test (jsdom doesn't actually download
  files — assert on Blob content/filename via mocking
  `URL.createObjectURL`/`document.createElement('a')` if a "download
  triggered" assertion is wanted, otherwise just test the pure
  content-generation functions and treat the anchor-click plumbing as
  trusted boilerplate).

## Risks

- Line numbers cited above (`SettingsView.tsx` ~570-630, `App.tsx`
  ~260-280, ~480-530, ~860-870) may have shifted since this plan was
  written — T1 exists specifically to re-verify before editing.
- Backdrop-based outside-click-close can visually conflict with the
  existing full-screen `modal-overlay` z-index/styling if the popover
  isn't scoped carefully — verify CSS stacking in T3's manual check.
- Safari's handling of immediate `URL.revokeObjectURL` after
  `a.click()` for downloads can be flaky in some versions — if manual
  smoke test in T4 shows a broken download in Safari, defer the revoke
  with a `setTimeout(..., 0)`.

## Open Questions Resolved By Judgment (flag to user)

- Exact SVG glyph shape for `DownloadIcon` — left as "arrow into tray,
  same stroke style as ShareIcon," implementer has visual latitude.
- Whether T2's handler logic gets a standalone unit test file or is
  only covered via the T3/T4 component-level test — plan defers this
  choice to whoever implements T2, based on whatever precedent exists
  for testing `App.tsx`-local handlers in this repo.
- T8's push-vs-local-merge choice is explicitly left as a checkpoint,
  not resolved — repo has no visible convention for this in
  CLAUDE.md/AGENTS.md.
