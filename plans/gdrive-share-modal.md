# Plan: Google Drive Per-File "Share Settings" Modal

## Overview

Add a "Share settings" icon button to every filter-rule backup-file row in
Settings (the list at `src/components/SettingsView.tsx` around lines
238-290). Clicking it opens a new `ShareModal` component that lets the user
see who has access to that Drive file, invite people by email, change
per-person roles, remove people, toggle general (link) access, and copy a
share link. Backed by real Google Drive Permissions API calls (list,
create, update, delete) added to `src/lib/driveApi.ts`. No OAuth scope
change — `drive.file` already covers Permissions calls for app-created
files.

Design reference: `design_handoff_gdrive_share_modal/README.md` and
`Diary App.dc.html` (prototype only, not shipped as-is).

Scope is strictly the filter-rule-backed rows already in the "Backup
files" list. Legacy month-based files get no share entry point.

## Resolved Decisions (baked in, not open questions)

1. Share button renders on every row, disabled with tooltip "Sync this
   file first" until `filterSyncState[rule.id].driveFileId` exists.
2. No scope change.
3. New `driveApi.ts` functions: `listPermissions`, `createPermission`
   (person variant + `anyone` variant), `updatePermission`,
   `deletePermission`. Same fetch/Bearer-token style as existing code.
4. State lives in `SettingsView.tsx` only (component-local, not
   persisted, not lifted to `App.tsx`):
   ```
   shareModalOpenFileId: string | null
   shareState: {
     [fileId]: {
       isLoading: boolean,
       loadError?: string,
       generalAccess: 'restricted' | 'anyone',
       generalRole: 'viewer' | 'commenter' | 'editor',
       generalPermissionId?: string,
       people: Array<{
         permissionId: string,
         email: string,
         displayName?: string,
         role: 'owner' | 'viewer' | 'commenter' | 'editor',
       }>,
     }
   }
   ```
   First open per fileId fetches via `listPermissions` (isLoading true
   during fetch); re-open reuses cached `shareState[fileId]`, no refetch.
5. Owner row is derived from the permission with `role === 'owner'` in
   the API response, not from local `driveAccount`.
6. Icons: inline SVG (share glyph, link-chain glyph, × close glyph),
   matching repo's existing inline-SVG convention. No icon library.
7. No toast system exists. Errors surface via local state + inline
   `<p className="...-error">`, same pattern as `connectError` in
   `SettingsView.tsx`.
8. Email validation via `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` gates the Invite
   button (disabled until it matches).
9. Copy link builds `https://drive.google.com/file/d/{fileId}/view`
   directly — no `files.get` call.
10. Tests: full unit coverage for the four new `driveApi.ts` functions
    (mock fetch, both person and `anyone` variants), lighter/optional
    component tests for `ShareModal`.
11. Invite leaves `sendNotificationEmail` at its default `true` — do not
    pass `false`.
12. All three roles (Viewer/Commenter/Editor) offered everywhere.
13. New standalone files `src/components/ShareModal.tsx` +
    `src/components/ShareModal.css`, imported into `SettingsView.tsx`.
    Not inlined into `SettingsView.tsx`/`.css`.
14. Optimistic UI everywhere (invite, role change, remove, general-access
    change): update `shareState` immediately, call the API, roll back
    that one change + show a scoped inline error on failure. Only the
    initial load failure gets a full-modal error.
15. Scope limited to filter-rule rows already rendered; no new UI for
    legacy month files.

## Data / API Contracts

### `src/lib/driveApi.ts` additions

```ts
export type DrivePermissionRole = 'owner' | 'reader' | 'commenter' | 'writer';
// Note: Drive API role strings are reader/writer, not viewer/editor.
// driveApi.ts functions pass through Drive's own role vocabulary
// ('reader' | 'commenter' | 'writer' | 'owner'); ShareModal.tsx is
// responsible for mapping to/from the UI vocabulary ('viewer' | 'editor').

export interface DrivePermission {
  id: string;
  type: 'user' | 'anyone';
  role: string;           // 'owner' | 'reader' | 'commenter' | 'writer'
  emailAddress?: string;  // present for type='user'
  displayName?: string;
}

export async function listPermissions(
  token: string,
  fileId: string
): Promise<DrivePermission[]>;
// GET .../files/{fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName)

export async function createPermission(
  token: string,
  fileId: string,
  opts: { emailAddress: string; role: string; sendNotificationEmail?: boolean }
): Promise<DrivePermission>;
// POST .../files/{fileId}/permissions  body: {type:'user', role, emailAddress}
// query: sendNotificationEmail (default true, omit param to use Drive default
// rather than explicitly passing true — simplest correct behavior)

export async function createAnyonePermission(
  token: string,
  fileId: string,
  role: string
): Promise<DrivePermission>;
// POST .../files/{fileId}/permissions  body: {type:'anyone', role}
// (separate named function rather than an overload — TS overloads on a
// single exported async function are awkward to mock in tests; two named
// functions are simpler for both call sites and driveApi.test.ts)

export async function updatePermission(
  token: string,
  fileId: string,
  permissionId: string,
  role: string
): Promise<DrivePermission>;
// PATCH .../files/{fileId}/permissions/{permissionId}  body: {role}

export async function deletePermission(
  token: string,
  fileId: string,
  permissionId: string
): Promise<void>;
// DELETE .../files/{fileId}/permissions/{permissionId}
```

Role vocabulary translation table (needed because Drive's API uses
`reader`/`writer`, the design doc and UI use `viewer`/`editor`):

| UI role     | Drive API role |
|-------------|-----------------|
| viewer      | reader          |
| commenter   | commenter       |
| editor      | writer          |
| owner       | owner           |

This mapping lives in `ShareModal.tsx` (two small helper functions
`toDriveRole`/`fromDriveRole`), not in `driveApi.ts` — `driveApi.ts`
stays a thin wrapper passing through whatever role string it's given.

### `ShareModal.tsx` props

```ts
interface ShareModalProps {
  fileId: string;
  fileName: string;
  token: string;               // access token, fetched by caller before opening
  state: ShareFileState;       // shareState[fileId] from SettingsView
  onLoad: () => Promise<void>; // triggers listPermissions fetch into shareState
  onInvite: (email: string) => Promise<void>;
  onRoleChange: (permissionId: string, role: PersonRole) => Promise<void>;
  onRemove: (permissionId: string) => Promise<void>;
  onGeneralAccessChange: (access: 'restricted' | 'anyone') => Promise<void>;
  onGeneralRoleChange: (role: 'viewer' | 'commenter' | 'editor') => Promise<void>;
  onCopyLink: () => void;
  onClose: () => void;
}
```
All the `on*` handlers are owned by `SettingsView.tsx` (they mutate its
local `shareState`); `ShareModal.tsx` is presentation + local UI-only
state (email input value, "Link copied" transient flag).

## Task List

Tasks are ordered; each is a self-contained diff, aim ≤30 min.

### 1. `src/lib/driveApi.ts` — add permission types + `listPermissions`
Add `DrivePermission` interface and `listPermissions(token, fileId)`.
GET request to
`https://www.googleapis.com/drive/v3/files/{fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName)`,
same header style as `listBackupFiles`. Return `data.permissions || []`.
No dependencies.

**Acceptance criteria:** function exists, exported, typed; returns `[]`
on empty/missing `permissions` field; passes `Bearer` header.

### 2. `src/lib/driveApi.ts` — add `createPermission` (person) + `createAnyonePermission`
Add both functions per contracts above. `createPermission` POSTs
`{type:'user', role, emailAddress}` plus `sendNotificationEmail` query
param only if explicitly passed (default: omit, let Drive default to
true). `createAnyonePermission` POSTs `{type:'anyone', role}`, no
`emailAddress`, no notification param.
Depends on: Task 1 (shares `DrivePermission` return type).

**Acceptance criteria:** both hit
`POST .../files/{fileId}/permissions` with correct JSON body and
`Content-Type: application/json`; both parse and return the created
permission object.

### 3. `src/lib/driveApi.ts` — add `updatePermission` + `deletePermission`
`updatePermission`: `PATCH .../permissions/{permissionId}` body
`{role}`. `deletePermission`: `DELETE .../permissions/{permissionId}`,
throws `Failed to update/delete permission: {statusText}` on
`!response.ok`, mirroring `deleteFile`'s error style.
Depends on: Task 1.

**Acceptance criteria:** correct HTTP method/URL/body per function;
`deletePermission` resolves `undefined` on success, throws descriptive
Error on failure (matches `deleteFile` pattern exactly for test
symmetry).

### 4. `src/__tests__/driveApi.test.ts` — tests for new functions
Add `describe` blocks for `listPermissions`, `createPermission`,
`createAnyonePermission`, `updatePermission`, `deletePermission`,
following the existing mock-fetch pattern (`vi.fn().mockResolvedValueOnce`,
assert URL/method/headers/body).

Concrete cases:
- `listPermissions`: returns parsed `permissions` array; returns `[]`
  when response has no `permissions` key.
- `createPermission`: body includes `type:'user'`, given `emailAddress`
  and `role`; `Authorization` header set; returns parsed permission.
- `createAnyonePermission`: body includes `type:'anyone'`, no
  `emailAddress` key present in body; returns parsed permission.
- `updatePermission`: PATCH to `.../permissions/{id}`, body `{role}`.
- `deletePermission`: DELETE to `.../permissions/{id}`; resolves
  `undefined` on `ok:true`; throws with statusText message on
  `ok:false`.
Depends on: Tasks 1-3.

**Acceptance criteria:** `npm test -- driveApi` green, all new cases
pass, no regression in existing `ensureJsonExtension`/`uploadNamedFile`/
`deleteFile` tests.

### 5. `src/types.ts` — add ShareModal-related types (optional, if not colocated in ShareModal.tsx)
Decide placement: put `PersonRole`, `GeneralAccess`, `SharePerson`,
`ShareFileState` types either in `types.ts` (if reused across files) or
locally in `ShareModal.tsx` (if only used there and in `SettingsView.tsx`
via import). Recommendation: define in `ShareModal.tsx` and export them,
imported by `SettingsView.tsx` — keeps `types.ts` focused on
persisted/domain types, and these are UI-transient. Skip editing
`types.ts` at all.
No dependencies (informs Task 7's file structure).

**Acceptance criteria:** no new persisted fields added to `FileSyncState`
or `FilterRule` — this feature adds zero IndexedDB schema changes.

### 6. `src/components/ShareModal.tsx` — scaffold component shell + icons
Create the file with the `ShareModalProps` interface (see contract
above), the role-mapping helpers `toDriveRole`/`fromDriveRole`, the email
regex constant, and three inline SVG icon components (`ShareIcon`,
`LinkIcon`, `CloseIcon`) matching the README's stroke specs (share glyph
14x14 stroke `#53565A` 1.2, link-chain 13x13, × close 16px). Render just
the overlay + panel + header (title `Share "{fileName}"` + close button)
for now — no body sections yet. Import into `SettingsView.tsx` is not
wired yet.
Depends on: Task 5 (type decisions).

**Acceptance criteria:** file compiles under `tsc`; exported
`ShareModal` component renders overlay/panel/header/close button when
given minimal props; clicking overlay or × calls `onClose`.

### 7. `src/components/ShareModal.tsx` — People with access section
Add the "PEOPLE WITH ACCESS" eyebrow + list. Each row: 28px avatar
(initial from email, first char uppercased) + email (ellipsis-truncated)
+ right side: plain "Owner" text if `role === 'owner'`, else a role
`<select>` (Viewer/Commenter/Editor, using `fromDriveRole`/`toDriveRole`
at the boundary) + × remove button calling `onRemove(permissionId)`.
Show a loading state (e.g. "Loading…" text) when `state.isLoading`, and
`state.loadError` as inline error text when present, in place of the list.
Depends on: Task 6.

**Acceptance criteria:** with `state.isLoading = true`, list is replaced
by a loading indicator; with `state.loadError` set, an inline error
paragraph renders; with `people` populated, owner shows plain text,
non-owners show role select + remove button; selecting a new role calls
`onRoleChange(permissionId, role)` with the UI-vocabulary role
('viewer'/'commenter'/'editor'), not the Drive-vocabulary role.

### 8. `src/components/ShareModal.tsx` — Add-people row (invite)
Add email `<input>` (local state, not lifted) + "Invite" button. Button
`disabled` unless input matches the email regex. On click, call
`onInvite(email)`, then clear the input on success; on failure, keep the
input's value and surface the passed-through error via a scoped inline
error under the invite row (component owns a local `inviteError` state
set by the caller's promise rejection, or `SettingsView` passes an error
string down — pick whichever keeps `ShareModal` simpler: local
`try/catch` around the `onInvite` call, catching and displaying
`error.message`).
Depends on: Task 7.

**Acceptance criteria:** Invite button disabled for `"not-an-email"`,
enabled for `"a@b.com"`; clicking Invite with a valid email calls
`onInvite` exactly once with that email; on `onInvite` rejecting, an
inline error appears and the input keeps its value (not cleared); on
resolving, input clears.

### 9. `src/components/ShareModal.tsx` — General access section
Add "GENERAL ACCESS" eyebrow, a `<select>` for `restricted`/`anyone`
bound to `state.generalAccess`, calling `onGeneralAccessChange`. When
`generalAccess === 'anyone'`, render a second inline `<select>` for
`generalRole` (Viewer/Commenter/Editor) calling `onGeneralRoleChange`.
Hide the second select when `restricted`.
Depends on: Task 7 (shares section layout conventions).

**Acceptance criteria:** with `generalAccess: 'restricted'`, only one
select renders; with `generalAccess: 'anyone'`, both selects render;
changing the access select calls `onGeneralAccessChange` with the new
value; changing the role select (when visible) calls
`onGeneralRoleChange`.

### 10. `src/components/ShareModal.tsx` — Footer (copy link + Done)
Add footer row: "Copy link" button (outline style, link-chain icon) that
calls `onCopyLink()` and flips its own label to "Link copied" for 1500ms
via local `useState`/`setTimeout` (component-owned transient UI state,
not lifted — matches the design doc's "prototype only simulates the
label change" note now made real via `navigator.clipboard.writeText`
inside `onCopyLink`, which is `SettingsView`'s job to implement, not
`ShareModal`'s — `ShareModal` just calls the callback and manages the
label timer). "Done" button calls `onClose()`.
Depends on: Task 9.

**Acceptance criteria:** clicking "Copy link" calls `onCopyLink` once
and label reads "Link copied" immediately after, then reverts to "Copy
link" after the 1.5s timer (use `vi.useFakeTimers()` in the test to
avoid a real wait); clicking "Done" calls `onClose`.

### 11. `src/components/ShareModal.css` — styling
New stylesheet following `SettingsView.css`'s structure (light styles
first, `@media (prefers-color-scheme: dark)` block second, no mobile
media query needed unless panel width needs adjusting under 600px).
Apply exact tokens from the README: overlay `rgba(8,26,89,0.35)`, panel
`#FFFFFF`/`12px radius`/`24px padding`/`440px width, max-width 92vw`/
shadow `0 8px 24px rgba(8,26,89,0.25)`; title `16px/500/#081A59`; eyebrow
`11px/600/0.08em/uppercase/#008C95`; avatar `28px/#D9FAFF bg/#081A59
text`; borders `#DDE0EC`; Invite button `#00A9CE` fill / hover `#22D0EF`;
Done button `#081A59` fill / hover `#0d2270`; Copy-link outline button
hover border+text `#00A9CE`. Add reasonable dark-mode equivalents (swap
white panel for a dark surface, adjust text tokens) — README doesn't
specify dark mode explicitly so use judgement consistent with
`SettingsView.css`'s dark block (dark surface `#2a2a2a`, light text
`#e0e0e0`).
Depends on: Tasks 6-10 (class names must exist to style).

**Acceptance criteria:** visually matches README's pixel values in light
mode; dark-mode block present and doesn't leave any element unstyled
white-on-white or black-on-black; no horizontal overflow at 440px/92vw.

### 12. `src/components/SettingsView.tsx` — share button on each row
In the backup-files-list row render (around current lines 258-286), add
a share-settings button to the right-hand action group, before the
existing Sync-now button. `disabled` when
`!props.filterSyncState[rule.id]?.driveFileId`; when disabled, add
`title="Sync this file first"` (simple tooltip via native `title` attr —
matches repo convention of not using a tooltip library). `aria-label="Share settings"`.
`onClick` calls a new local handler `handleOpenShare(rule.id)` (added in
Task 13) — for this task, stub it to just set `shareModalOpenFileId`
(fetch logic lands in Task 13).
Depends on: Task 11 is not required for this task to compile, but do
Tasks 12+13 before shipping since the button is useless without the
modal wired.

**Acceptance criteria:** share button renders on every filter-rule row;
disabled + has `title` attr when no `driveFileId`; enabled, no title,
when `driveFileId` present; clicking sets `shareModalOpenFileId` to that
rule's `driveFileId`.

### 13. `src/components/SettingsView.tsx` — wire ShareModal state + handlers
Add local state: `shareModalOpenFileId`, `shareState` (per contract).
Implement:
- `handleOpenShare(fileId)`: sets `shareModalOpenFileId`; if
  `shareState[fileId]` doesn't exist, seed
  `{isLoading:true, generalAccess:'restricted', generalRole:'viewer',
  people:[]}`, get a token (reuse existing token-fetch path used
  elsewhere in `SettingsView`/`App.tsx` — check how `onSyncFilterRule`
  etc. get tokens; if `SettingsView` doesn't currently call
  `getAccessToken` directly, either add a new prop
  `onGetShareToken: () => Promise<string>` passed from `App.tsx`
  wrapping `getAccessToken`, or thread the token down as a prop — pick
  whichever matches how the rest of `SettingsView` already accesses
  Drive; note during research `SettingsView.tsx` itself has no direct
  Drive/token calls today, all Drive I/O happens in `App.tsx`-owned
  callbacks passed as props — so this needs a **new prop**, e.g.
  `onLoadSharePermissions: (fileId: string) => Promise<DrivePermission[]>`,
  implemented in `App.tsx` as a thin wrapper around `getAccessToken` +
  `listPermissions`, following the same pattern as `onSyncFilterRule`).
  Then call it, map results into `generalAccess`/`generalRole`/
  `generalPermissionId`/`people` (translating Drive roles via
  `fromDriveRole`), set `isLoading:false`. On failure, set
  `loadError`.
- `handleCloseShare()`: sets `shareModalOpenFileId` to `null`; does not
  touch `shareState`.
- `handleInvite(fileId, email)`, `handleRoleChange(fileId, permissionId, role)`,
  `handleRemove(fileId, permissionId)`, `handleGeneralAccessChange(fileId, access)`,
  `handleGeneralRoleChange(fileId, role)`, `handleCopyLink(fileId)` — each
  optimistically mutates `shareState[fileId]`, then calls a corresponding
  new `App.tsx`-provided prop (`onInvitePerson`, `onChangePersonRole`,
  `onRemovePerson`, `onChangeGeneralAccess`, `onChangeGeneralRole`) that
  wraps the matching `driveApi.ts` function with a fresh token; on
  rejection, roll back the specific mutated field/row and set a scoped
  error (e.g. `inviteError`, or reuse `loadError` scoped per action if
  simpler — pick one convention and apply consistently). `handleCopyLink`
  builds the URL locally (`https://drive.google.com/file/d/{fileId}/view`)
  and calls `navigator.clipboard.writeText` directly — no new App.tsx
  prop needed for this one since it's pure client-side.
Render `<ShareModal ... />` conditionally when `shareModalOpenFileId`
is set, passing `shareState[shareModalOpenFileId]` and the handlers bound
to that fileId.
Depends on: Task 12, and requires new `App.tsx` props (Task 14).

**Acceptance criteria:** opening share on a never-opened fileId shows
loading then populates people/general-access from a mocked
`onLoadSharePermissions`; opening a second time reuses cached state (mock
not called again); invite/role-change/remove/general-access-change all
update `shareState` before their promise resolves (optimistic) and roll
back on rejection with a visible scoped error; closing and reopening
after a rollback shows the rolled-back (correct) state, not the failed
optimistic one.

### 14. `src/App.tsx` — new Drive prop wrappers for SettingsView
Add thin wrapper functions passed as new `SettingsView` props:
`onLoadSharePermissions(fileId)`, `onInvitePerson(fileId, email)`,
`onChangePersonRole(fileId, permissionId, role)`,
`onRemovePerson(fileId, permissionId)`,
`onChangeGeneralAccess(fileId, access)`,
`onChangeGeneralRole(fileId, permissionId, role)` — each fetches a fresh
token via `getAccessToken()` (existing helper from `googleAuth.ts`,
already imported/used elsewhere in `App.tsx` for sync), then calls the
matching `driveApi.ts` function(s), converting UI role vocabulary to
Drive vocabulary at this boundary (or leave conversion in
`SettingsView.tsx` — pick one place, not both; recommend doing it in
`ShareModal.tsx`/`SettingsView.tsx` since `App.tsx`'s wrappers should
stay dumb pass-throughs like its other Drive wrappers, e.g.
`onSyncFilterRule`). For `onChangeGeneralAccess`, note the two-step
Drive semantics: switching `restricted → anyone` calls
`createAnyonePermission`; switching `anyone → restricted` calls
`deletePermission` on the stored `generalPermissionId`. Handle both
directions in this one wrapper (or split into
`onSetGeneralAccessRestricted`/`onSetGeneralAccessAnyone` if that's
cleaner — pick one).
Depends on: Task 1-3 (driveApi functions must exist).

**Acceptance criteria:** each wrapper calls `getAccessToken()` exactly
once per invocation then the correct `driveApi.ts` function with correct
args; `onChangeGeneralAccess('restricted')` calls `deletePermission` with
the stored `generalPermissionId`; `onChangeGeneralAccess('anyone')` calls
`createAnyonePermission` with the current `generalRole`; wrappers are
passed to `<SettingsView>` in the prop list (same section as other Drive
props, roughly lines 738-758 per the file's existing layout).

### 15. `src/components/ShareModal.test.tsx` (or colocated in existing test dir) — component tests
Cover the "lighter/optional" list from requirements, at minimum:
- Modal opens: renders loading state, then people list once `state`
  updates (simulate parent passing `isLoading:false` + populated
  `people` after an async `onLoad`).
- Invite adds a person optimistically: after calling
  `onInvite` resolves, the new person appears (verify via prop state
  change, since `ShareModal` itself is state-driven from
  `SettingsView`/test harness).
- Role change: selecting a new role in a person row calls
  `onRoleChange` with the right args.
- Remove: clicking × calls `onRemove` with the right permissionId.
- General-access toggle: switching to "anyone" reveals the link-role
  select; switching back hides it.
- Copy-link: clicking shows "Link copied" then reverts after the fake-
  timer advance.
Depends on: Tasks 6-10.

**Acceptance criteria:** `npm test -- ShareModal` green; each bullet has
at least one passing test case.

### 16. Manual smoke pass + `npm run build` + `npm test`
Run full build and test suite. Manually verify (via `/run` skill or dev
server) that: share button is disabled pre-sync, enabled post-sync;
modal opens, shows real Drive permissions for a real synced file (needs
a real Drive connection to fully verify — otherwise verify via mocked
network in dev tools); invite/role-change/remove/general-access/copy-link
all work against the live Drive API for at least one test file.
Depends on: all prior tasks.

**Acceptance criteria:** `npm run build` clean, `npm test` full suite
green, manual smoke confirms at least one real invite + one real role
change + one real removal succeed against Drive without errors.

## Test Cases Summary

**`driveApi.test.ts` (required, unit-level, mocked fetch):**
- `listPermissions` — parses `permissions` array; empty-array fallback.
- `createPermission` — correct body/type for person grant; default
  notification behavior (no explicit `sendNotificationEmail:false`).
- `createAnyonePermission` — correct body/type for link access, no
  `emailAddress`.
- `updatePermission` — PATCH with `{role}` body to correct URL.
- `deletePermission` — DELETE to correct URL; resolves on ok; throws
  descriptive error on failure.

**`ShareModal.test.tsx` (optional/lighter, component-level):**
- Loading → people list transition.
- Invite optimistic add.
- Role change in place.
- Remove row.
- General-access select toggles link-role select visibility.
- Copy-link transient "Link copied" label (fake timers).

**`SettingsView.test.tsx` additions:**
- Share button disabled + tooltip text when `driveFileId` absent.
- Share button enabled, no tooltip, when `driveFileId` present.
- Clicking share button opens modal for the correct file.
- First open triggers `onLoadSharePermissions`; second open (same
  session) does not call it again.
- A rejected invite/role-change/remove/general-access call rolls back
  the optimistic UI change and shows a scoped inline error.

## Acceptance Criteria (feature-level)

- Share button appears on every filter-rule backup-file row; disabled
  with "Sync this file first" tooltip until that rule has synced at
  least once.
- Opening the modal for a never-opened file fetches real permissions via
  `listPermissions`; re-opening reuses cached state without refetching.
- Owner is derived from the API's `role: 'owner'` permission, never from
  local `driveAccount`.
- Invite triggers Drive's default notification email (not suppressed).
- All three roles (Viewer/Commenter/Editor) available on every role
  selector, with no role restrictions.
- Copy link produces `https://drive.google.com/file/d/{fileId}/view`
  and copies it to the clipboard, with a 1.5s "Link copied" confirmation.
- All mutations are optimistic with per-action rollback + scoped inline
  error on failure; only the initial permissions load shows a full-modal
  error state.
- No IndexedDB schema changes; `shareState`/`shareModalOpenFileId` are
  React-only, lost on reload (by design, per resolved decision 4).
- No new UI is added for legacy month-based backup files.
- `npm run build` and `npm test` pass clean.

## Open Questions / Risks Found While Reading Code

- **`SettingsView.tsx` has no existing Drive/token access.** All Drive
  I/O today is owned by `App.tsx` and exposed to `SettingsView` as
  already-composed callback props (e.g. `onSyncFilterRule`). This plan
  assumes new thin wrapper props on `App.tsx` (Task 14) for each share
  action, following that existing pattern, rather than passing a raw
  token down to `SettingsView`/`ShareModal`. This wasn't spelled out in
  the resolved decisions and is worth confirming before implementation
  — an alternative is a single `onGetDriveToken: () => Promise<string>`
  prop and letting `SettingsView` call `driveApi.ts` functions directly,
  which is more code in `SettingsView.tsx` but fewer one-off wrapper
  functions in `App.tsx`. Either works; picked the wrapper-per-action
  approach for consistency with existing props.
- **Drive API role vocabulary mismatch.** Drive's Permissions API uses
  `reader`/`writer`/`commenter`/`owner`, but the design doc and resolved
  decisions use `viewer`/`editor`/`commenter`/`owner`. This needs an
  explicit mapping layer (proposed in `ShareModal.tsx` per the Data/API
  Contracts section) — not called out in the resolved decisions, so
  flagging it as a concrete implementation detail to get right, not a
  blocking question.
- **General-access permission lifecycle**: Drive represents "anyone with
  link" as a distinct permission object (`type: 'anyone'`) that must be
  created when turning it on and deleted (not just role-updated) when
  turning it off, unlike person permissions which are updated in place.
  The plan's Task 14 handles this, but it's a subtlety worth
  double-checking against Drive API docs during implementation — e.g.
  whether toggling `anyone`'s role while already `anyone` should PATCH
  the existing `generalPermissionId` (update, not create) versus create
  a duplicate. The state shape's `generalPermissionId` field supports
  this correctly if implemented carefully.
- **No design doc guidance for `displayName`.** The state shape includes
  optional `displayName` for people, but the avatar-initial and row
  label in the README use email only. Unclear if `displayName` should
  be preferred in the UI when present (e.g. Drive returns a real name
  for existing Google contacts) — the design doc's HTML prototype only
  ever uses `email`. Recommend defaulting to email-only display for v1
  and treating `displayName` as forward-compat/unused, to stay faithful
  to the "high-fidelity" design doc; flagging in case product wants
  richer display later.
- **Tooltip UX**: resolved decision 1 says "tooltip" but the codebase
  has no tooltip component — Task 12 uses the native `title` attribute,
  which is a reasonable but low-fidelity interpretation (no styling
  control, inconsistent OS-level delay/appearance). Fine for v1 given no
  tooltip library exists in the repo; flagging in case a nicer custom
  tooltip is expected later.
