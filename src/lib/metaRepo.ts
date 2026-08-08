import { DriveMeta, FileSyncState, FilterRule } from '../types';
import { getDB } from './db';

const DRIVE_META_KEY = 'drive-meta';
const FILTER_RULES_KEY = 'filter-rules';
const FILTER_SYNC_STATE_KEY = 'filter-sync-state';

export async function getDriveMeta(): Promise<DriveMeta> {
  const db = await getDB();
  const meta = await db.get('meta', DRIVE_META_KEY);
  return (meta as DriveMeta) || { driveConnected: false };
}

export async function setDriveMeta(meta: Partial<DriveMeta>): Promise<void> {
  const db = await getDB();
  const existing = await getDriveMeta();
  await db.put('meta', { ...existing, ...meta }, DRIVE_META_KEY);
}

export async function getFilterRules(): Promise<FilterRule[]> {
  const db = await getDB();
  const rules = await db.get('meta', FILTER_RULES_KEY);
  return (rules as FilterRule[]) || [];
}

export async function setFilterRules(rules: FilterRule[]): Promise<void> {
  const db = await getDB();
  await db.put('meta', rules, FILTER_RULES_KEY);
}

export async function getFilterSyncState(): Promise<Record<string, FileSyncState>> {
  const db = await getDB();
  const state = await db.get('meta', FILTER_SYNC_STATE_KEY);
  return (state as Record<string, FileSyncState>) || {};
}

export async function setFilterSyncState(state: Record<string, FileSyncState>): Promise<void> {
  const db = await getDB();
  await db.put('meta', state, FILTER_SYNC_STATE_KEY);
}

/**
 * Legacy per-project token storage key, previously owned by the now-deleted
 * googleAuth.ts (superseded by @open-webapp/drive-sync's own token storage,
 * which uses its own IndexedDB databases rather than this app's 'meta'
 * store). This key is no longer written, but a one-time boot cleanup
 * (see cleanupLegacyOAuthToken) actively deletes any leftover value from
 * existing installs rather than just leaving it to rot in place.
 */
const LEGACY_OAUTH_TOKEN_KEY = 'oauth-token';

/**
 * One-time boot cleanup: removes the legacy oauth-token meta key from the
 * CURRENT project's IndexedDB meta store, if present. Safe to call
 * unconditionally on every boot (a no-op once the key is gone) — this app
 * has one 'meta' store per project db, so this must run once per project db
 * that's opened, not just once globally.
 */
export async function cleanupLegacyOAuthToken(): Promise<void> {
  const db = await getDB();
  await db.delete('meta', LEGACY_OAUTH_TOKEN_KEY);
}
