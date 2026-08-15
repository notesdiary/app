# Schema Spec — Notes Diary

Sibling docs: [design.md](./design.md), [product-behavior.md](./product-behavior.md)

All storage is client-side IndexedDB (via `idb`). No server/backend schema.

## Registry DB: `notes-diary-registry`

One shared DB, version 1, store `projects` (keyPath `id`).

```ts
type Project = {
  id: string;          // 'proj-' + crypto.randomUUID()
  name: string;         // trimmed, unique case-insensitively among projects
  dbName: string;        // name of this project's own entries IndexedDB
  createdAt: number;      // epoch ms
};
```

- Legacy migrated project (see product/design docs): `dbName: 'notes-diary'` (the pre-multi-project DB name), `name: 'My Notes'`. Created only if the registry is empty AND that legacy DB exists (`indexedDB.databases()`).

## Per-project entries DB: `<project.dbName>`

Version 2. Two stores:

### `entries` (keyPath `id`)
Index: `by-date` on `date`.

```ts
type Entry = {
  id: string;          // `${date}-${time}-${random9chars}`
  date: string;          // ISO YYYY-MM-DD
  time: string;           // HH:MM, 24h
  text: string;            // raw text; may contain multiple \n\n-separated sections and #tags
  archived?: boolean;       // soft-delete flag; undefined/false = active
  createdAt: number;         // epoch ms, set once at creation, never updated
};
```

Invariants:
- No index on `archived` (removed in the v1→v2 migration) — active/archived filtering is done client-side by scanning `getAll()`.
- `text` empty/whitespace-only is never persisted as an entry — `updateEntryText` deletes the row instead.
- Sync-merged entries (from `putEntries`) are `put` (upsert), preserving the original `id`/`createdAt` when they already exist locally.

### `meta` (key-value, no keyPath — key passed explicitly to `get`/`put`)

| Key | Value type | Notes |
|---|---|---|
| `drive-meta` | `DriveMeta` | merged (not replaced) on partial `setDriveMeta(patch)` calls |
| `filter-rules` | `FilterRule[]` | full array replace on every write |
| `filter-sync-state` | `Record<string, FileSyncState>` | keyed by `FilterRule.id`; full object replace on every write |
| `oauth-token` | *(legacy, unused)* | actively deleted on every project boot via `cleanupLegacyOAuthToken()`; token storage now lives in `@open-webapp/drive-sync`'s own IndexedDB, keyed by `(appId, projectId)`, not here |

```ts
type DriveMeta = {
  driveConnected: boolean;
  driveAccount?: string;     // connected Google account email
  driveFolderId?: string;    // resolved Drive folder id for this project
};

type FilterRule = {
  id: string;           // 'fr-' + crypto.randomUUID()
  filter: string;         // substring to match against Entry.text (case-insensitive); ignored if isRemainder
  fileName: string;        // Drive backup filename; '.json' appended if missing
  isRemainder: boolean;     // true = catch-all rule; at most one per project
};

type SyncStatus = 'pending' | 'syncing' | 'synced' | 'remote-pending';

type FileSyncState = {
  status: SyncStatus;
  lastSynced?: number;   // epoch ms, set on successful sync
  driveFileId?: string;    // Google Drive file id once known
};
```

## Drive-side files (not IndexedDB, but part of the persisted schema)

- One JSON file per `FilterRule`, named `ensureJsonExtension(rule.fileName)`, containing `Entry[]` (`JSON.stringify(entries, null, 2)`) — the *matched* entries for that rule, not the whole project.
- Located under Drive folder `Notes Diary` (legacy migrated project) or `Notes Diary/<projectName>` (all other projects).
- Legacy month-based files (e.g. `July 2026.json`, one per calendar month of a single-project install) may still exist in Drive from before filter-rule sync existed; current code does not read or write them — they're left untouched. The Archive view's month-grouping UI mirrors this legacy naming but is a local-only display convention, not a re-implementation of that format.
