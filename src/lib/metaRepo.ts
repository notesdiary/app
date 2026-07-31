import { DriveMeta, FileSyncState, FilterRule } from '../types';
import { getDB } from './db';

const EXTRA_DATES_KEY = 'extra-dates';
const DRIVE_META_KEY = 'drive-meta';
const FILTER_RULES_KEY = 'filter-rules';
const FILTER_SYNC_STATE_KEY = 'filter-sync-state';

export async function getExtraDates(): Promise<string[]> {
  const db = await getDB();
  const dates = await db.get('meta', EXTRA_DATES_KEY);
  return (dates as string[]) || [];
}

export async function addExtraDate(date: string): Promise<void> {
  const db = await getDB();
  const dates = await getExtraDates();
  if (!dates.includes(date)) {
    dates.push(date);
    await db.put('meta', dates, EXTRA_DATES_KEY);
  }
}

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
