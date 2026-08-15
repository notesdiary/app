# Product Behavior — Notes Diary

Sibling docs: [design.md](./design.md), [schema-spec.md](./schema-spec.md)

## Navigation / URL state

- Hash-routed, two routes: `#/` (project picker) and `#/project/<id>` (diary shell for that project).
- Opening a project navigates to `#/project/<id>`; "Switch Project" navigates back to `#/`.
- Unknown/deleted `<id>` in the URL redirects to `#/` once projects have loaded.
- Within a project, the active sub-view (`diary` | `settings` | `archive` | `about`) is in-memory React state only — not reflected in the URL, so a page reload always lands back on `diary`.

## Project picker (`#/`)

- Lists all projects with name + "Created <date>"; empty state: "No projects yet. Create one below to get started."
- Create: name input + button, Enter key also submits. Empty/whitespace name → inline error "Project name cannot be empty". Duplicate name (case-insensitive, trimmed) → error "A project with that name already exists". Button shows "Creating…" while in flight.
- Delete: native `window.confirm("Are you sure you want to delete \"<name>\"? This action cannot be undone.")`. On confirm, deletes the project's entries IndexedDB, its registry record, and drive-sync's per-project auth database. No undo.

## Diary view

- **Composer**: shown only when no search/tag filter is active (mode `'all'`). Placeholder: "Write a note, use #tags to organize it...". Autosizing textarea; timestamp shown is the current time, live at render. Blurring with non-empty trimmed text creates an entry stamped with today's date and current `HH:MM`; blurring empty just clears the draft (no entry created).
- **Entries**: newest first (sort by date desc, then time desc). Each entry can contain multiple **sections** (paragraphs separated by one or more blank lines); each section's tags are computed independently.
- **Editing**: click any section of an entry (not while already editing) to turn the whole entry into an editable textarea, autofocused. Blur saves. Saving with empty/whitespace text **deletes the entry entirely** (not just clears it).
- **Removing an entry**: hover reveals a "×" button per entry ("Archive entry" tooltip) — this archives (soft-deletes), never hard-deletes directly from the diary view.
- **Tags**: `#word` (letter then word chars/hyphens) anywhere in text is a live tag, rendered distinctly from plain text and clickable to filter by it. Sections with zero tags count as "Untagged".
- **Search**: typed into the header search box; case-insensitive substring match against full entry text (not per-section) determines which *entries* show, but within a matching entry only the sections that also individually match the query are displayed. Search takes precedence over tag filters (mode `'search'` wins if the query is non-empty, regardless of selected tags).
- **Tag filter**: clicking a tag in the left rail toggles it in/out of `selectedTags` (multi-select, OR semantics — an entry/section matches if it has *any* selected tag, and `__untagged__` matches sections with zero tags).

## Left rail (tag browser)

- Lists every tag found across all non-archived entries' sections, with a count, sorted by count desc then alphabetically. An "Untagged" pseudo-entry appears first if any untagged sections exist.
- Footer icons: Archived (badge shows archived count when > 0), Settings, Switch Project; plus an "About" text button.
- On mobile (< 960px), the rail is a slide-in drawer with a backdrop; clicking a tag or a nav icon auto-closes it.

## Archive view

- Header: "Removed entries land here instead of being deleted, grouped one document per month to match your Drive backups. Restore them or delete them for good."
- Archived entries are grouped by `date`'s year-month, newest month first, labeled like `📄 August 2026.json <N entries>` — mirroring the naming convention of month-based Drive backup files (a legacy format; current backups are filter-rule-based, see below).
- Within a group: entries sorted date desc then time desc. Each has non-interactive rendered text (tags shown but not clickable) plus "Restore" and "Delete forever" (irreversible, no confirm dialog) buttons.
- Empty state: "Nothing archived."

## Settings — Google Drive backup

- **Disconnected**: "Connect Google Drive" button (OAuth prompt). Explanation: "While connected, entries matching your filters get backed up to their own file in Drive, and sync automatically. If you edit a file directly in Drive, I pick up those changes the next time I sync."
- **Connected**: account chip (email), "Disconnect" button, and — if the account's granted OAuth scopes no longer cover what's required — a re-auth banner: "Your Google Drive connection needs to be renewed to keep backing up." with a "Reconnect" button.
- **Filter rules**: each rule is a row of `[filter text input] → [filename input] [Remove]`, except the remainder rule, whose left side is a fixed "Everything else" box instead of an input. "+ Add filter" always available; "+ Add \"everything else\" filter" only shown if no remainder rule exists yet (at most one remainder rule).
- Duplicate filenames across rules (after appending `.json` if missing) are flagged inline per row: "This filename is used by another rule — pick a unique name." Rules with duplicate filenames, empty required fields, or a filename empty are excluded from "Sync now"/"Sync filters now".
- **Backup files list**: one row per rule showing a status dot (grey=unknown, orange=pending, cyan=synced/remote-pending), filename, live entry-match count, status text ("Not yet synced" / "Syncing…" / "Synced <date>" / "Backed up in Drive, not yet downloaded"), a share icon (enabled only once the file has synced at least once — has a `driveFileId`), a download icon button (enabled when rule has ≥1 matched entry AND non-blank filename, independent of Drive sync state), and a "Sync now" button.
  - Download button opens a dropdown menu: "Download as JSON" (exports raw entry array, same shape as Drive backup file) or "Download as Markdown" (grouped by date, newest first; within each date, `**HH:MM** — text` format, newest time first). 100% local/client-side, no Drive/network involved.
- **Removing a filter rule** prompts a modal: "Remove this filter rule? The Drive file won't be deleted unless you choose to. You can always restore entries by re-syncing the file." — choices are "Keep the Drive file, just stop syncing it", "Also delete the file from Drive", or "Cancel".
- **Disconnecting** prompts a modal: "Disconnect Google Drive? You can disconnect and keep both your local notes and Drive backups. Or, remove all local notes that are already backed up. You can always restore them from Drive later." — choices "Just disconnect — keep both copies", "Disconnect and delete local copies", "Cancel".
- **Sharing** (share icon on a backup file): opens `ShareModal` showing general access (restricted/anyone, with a role) and a per-person list (invite by email, change role, remove); a "Copy link" action builds `https://drive.google.com/file/d/<fileId>/view`. All mutations are applied optimistically and rolled back on error.

## Mobile responsive

- Breakpoint: 960px viewport width.
- Below it, the left rail becomes a fixed drawer (hamburger button in the diary header toggles it) with a tap-to-close backdrop; navigating (tag click, settings/archive/about/switch-project) auto-closes the drawer.

## Offline / PWA

- Installable as a PWA (manifest name "Notes Diary", standalone display). Static assets and fonts precached via Workbox (`vite-plugin-pwa`, `autoUpdate` registration).
- On startup, requests persistent storage (`navigator.storage.persist()`) so the browser is less likely to evict IndexedDB data under storage pressure.
- All core features (composing, editing, archiving, tagging, search) work fully offline — only Drive connect/sync requires network.
