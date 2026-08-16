import { useState, useEffect, useCallback } from 'react';
import { Entry, FileSyncState, FilterRule, Project } from './types';
import { getTodayISO } from './lib/dateUtils';
import { deriveMode } from './lib/mode';
import { filterEntries, filterParagraphsInEntry } from './lib/entryFiltering';
import { listAllEntries, createEntry, updateEntryText, archiveEntry, putEntries, countArchivedEntries } from './lib/entriesRepo';
import { getDriveMeta, setDriveMeta, getFilterRules, setFilterRules, getFilterSyncState, setFilterSyncState, cleanupLegacyOAuthToken } from './lib/metaRepo';
import { drive, ensureProjectFolderId, ensureJsonExtension, DrivePermission } from './lib/drive';
import type { ProjectHandle } from '@open-webapp/drive-sync';
import { setActiveProjectDb } from './lib/db';
import { listProjects, createProject, deleteProject, getProject, migrateLegacyDbIfNeeded } from './lib/projectRegistry';
import { useHashRoute } from './hooks/useHashRoute';
import { navigateToProject, navigateToPicker } from './lib/router';
import { useWindowWidth } from './hooks/useWindowWidth';
import { LeftRail } from './components/LeftRail';
import { DiaryView } from './components/DiaryView';
import { ArchiveView } from './components/ArchiveView';
import { SettingsView } from './components/SettingsView';
import { AboutView } from './components/AboutView';
import { Backdrop } from './components/Backdrop';
import { ProjectPicker } from './components/ProjectPicker';
import './App.css';

type ViewType = 'diary' | 'settings' | 'archive' | 'about';

/**
 * Reads a Drive JSON backup file's entries. Mirrors driveApi.ts's old
 * downloadFileContent + Array.isArray(...) ? ... : [] contract: a missing
 * file (files.read() returns null on 404), a non-text (Blob) result, or
 * unparsable/non-array content are all treated the same as "no entries",
 * rather than thrown.
 */
async function readEntriesFile(project: ProjectHandle, fileId: string): Promise<Entry[]> {
  const content = await project.files.read(fileId);
  if (typeof content !== 'string') return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function App() {
  // State: projects and active project
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // State: entries and metadata
  const [entries, setEntries] = useState<Entry[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);

  // State: Google Drive
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveAccount, setDriveAccount] = useState<string | undefined>();
  const [driveFolderId, setDriveFolderId] = useState<string | undefined>();
  // True when the connected account's granted OAuth scopes no longer cover
  // everything drive-sync requires (e.g. an existing connection made before
  // this app additionally required the userinfo.email scope). Computed
  // locally by getConnection() — no network call.
  const [needsReauth, setNeedsReauth] = useState(false);

  // State: filter sync rules
  const [filterRules, setFilterRulesLocal] = useState<FilterRule[]>([]);
  const [filterSyncState, setFilterSyncStateLocal] = useState<Record<string, FileSyncState>>({});

  // State: UI filters and mode
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // State: editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  // State: composer
  const [composerText, setComposerText] = useState('');

  // State: navigation
  const [view, setView] = useState<ViewType>('diary');

  // State: responsive UI
  const width = useWindowWidth();
  const isMobile = width < 960;
  const [leftOpen, setLeftOpen] = useState(true);

  // State: Drive discovery (picker route)
  const [driveDiscoveredFolders, setDriveDiscoveredFolders] = useState<{ name: string; modifiedTime: string }[]>([]);
  const [driveDiscoveryLoading, setDriveDiscoveryLoading] = useState(false);

  // Activate drive-sync's background token-refresh listeners once, for the
  // life of the app. Disposed on unmount.
  useEffect(() => {
    console.log('[Drive] Activating background token-refresh listeners');
    let dispose: (() => void) | undefined;
    try {
      dispose = drive.activate();
    } catch (error) {
      console.error('[Drive] Failed to activate:', error);
    }
    return () => {
      if (dispose) {
        try {
          dispose();
        } catch (error) {
          console.error('[Drive] Error disposing listeners:', error);
        }
      }
    };
  }, []);

  // Load projects from registry on mount
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      await migrateLegacyDbIfNeeded();
      const loadedProjects = await listProjects();
      setProjects(loadedProjects);
      setProjectsLoaded(true);
      // Drops any per-project auth IndexedDB databases drive-sync is still
      // holding onto for projects that no longer exist in the registry
      // (e.g. deleted while the app was closed, or via another device).
      await drive.reconcile(loadedProjects.map((p) => p.id));
    })();
  }, []);

  // Get the current route
  const route = useHashRoute();

  // Load entries from IndexedDB on mount (guarded by activeProject)
  useEffect(() => {
    if (!activeProject) return;

    (async () => {
      // One-time cleanup of the legacy oauth-token meta key, now owned by
      // drive-sync's own (separate) IndexedDB storage. Runs per-project
      // since each project has its own 'meta' store.
      await cleanupLegacyOAuthToken();

      const allEntries = await listAllEntries();
      setEntries(allEntries);
      setArchivedCount(await countArchivedEntries());

      // Load Drive metadata. Every field is set unconditionally (even to
      // undefined) so switching to a project whose meta lacks a field resets
      // it, instead of leaking the previously active project's value.
      const driveMeta = await getDriveMeta();
      setDriveConnected(driveMeta.driveConnected);
      setDriveAccount(driveMeta.driveAccount);
      setDriveFolderId(driveMeta.driveFolderId);

      // Proactively detect whether the connected account's granted scopes
      // are missing a now-required scope (e.g. userinfo.email, added after
      // this account first connected). Purely local — getConnection() makes
      // no network call.
      if (driveMeta.driveConnected) {
        const connection = await drive.project(activeProject.id).getConnection();
        setNeedsReauth(connection?.needsReauth ?? false);
      } else {
        setNeedsReauth(false);
      }

      // Load filter rules and sync state
      let rules = await getFilterRules();
      const filterSync = await getFilterSyncState();
      setFilterSyncStateLocal(filterSync);

      // Auto-seed: if no rules exist, create a default remainder rule
      if (rules.length === 0) {
        const seeded = [{ id: 'fr-' + crypto.randomUUID(), filter: '', fileName: 'notesdiary-backup.json', isRemainder: true }];
        setFilterRulesLocal(seeded);
        await setFilterRules(seeded);
      } else {
        setFilterRulesLocal(rules);
      }
    })();
  }, [activeProject?.id]);


  // Auto-sync to Drive every 5 minutes when connected
  useEffect(() => {
    if (!driveConnected) return;

    const intervalId = setInterval(async () => {
      try {
        console.log('[Sync] Auto-sync starting...');
        await syncAllNow();
        console.log('[Sync] Auto-sync completed');
      } catch (error) {
        console.error('[Sync] Auto-sync failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(intervalId);
  }, [driveConnected, filterRules]);

  // Periodically re-check (locally — no network call) whether the connected
  // account's scopes still cover everything drive-sync requires. Actual
  // background token refresh (the old checkConnection's real purpose) is
  // now handled by drive.activate()'s visibilitychange/pageshow listeners.
  useEffect(() => {
    if (!driveConnected || !activeProject) return;

    const checkNeedsReauth = async () => {
      const connection = await drive.project(activeProject.id).getConnection();
      setNeedsReauth(connection?.needsReauth ?? false);
    };

    const intervalId = setInterval(checkNeedsReauth, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [driveConnected, activeProject?.id]);

  // Derive the current mode
  const mode = deriveMode(searchQuery, selectedTags, selectedDate);

  // Filter entries based on current mode and filters
  const filteredEntries = filterEntries(entries, mode, selectedTags, searchQuery, selectedDate);

  // Rule CRUD (local + persisted, no Drive calls)
  const addFilterRule = async () => {
    const next = [...filterRules, { id: 'fr-' + crypto.randomUUID(), filter: '', fileName: '', isRemainder: false }];
    setFilterRulesLocal(next);
    await setFilterRules(next);
  };

  const addRemainderRule = async () => {
    // Defensive: check if remainder rule already exists
    if (filterRules.some(r => r.isRemainder)) {
      return;
    }
    const next = [...filterRules, { id: 'fr-' + crypto.randomUUID(), filter: '', fileName: '', isRemainder: true }];
    setFilterRulesLocal(next);
    await setFilterRules(next);
  };

  const updateFilterRule = async (id: string, field: 'filter' | 'fileName', value: string) => {
    const next = filterRules.map(r => r.id === id ? { ...r, [field]: value } : r);
    setFilterRulesLocal(next);
    await setFilterRules(next);
  };

  const removeFilterRule = async (id: string, alsoDeleteFromDrive: boolean) => {
    // If requested, delete from Drive
    if (alsoDeleteFromDrive && filterSyncState[id]?.driveFileId && activeProject) {
      try {
        await drive.project(activeProject.id).files.remove(filterSyncState[id].driveFileId!);
      } catch (error) {
        console.error(`Failed to delete filter rule ${id} from Drive:`, error);
      }
    }

    // Remove rule from filterRules
    const next = filterRules.filter(r => r.id !== id);
    setFilterRulesLocal(next);

    // Remove its entry from filterSyncState
    const nextSyncState = { ...filterSyncState };
    delete nextSyncState[id];
    setFilterSyncStateLocal(nextSyncState);

    // Persist both
    await setFilterRules(next);
    await setFilterSyncState(nextSyncState);
  };

  // Download helpers: format and filename
  const getDownloadFilename = (fileName: string, format: 'json' | 'markdown'): string => {
    const trimmed = fileName.trim();
    // Strip any existing extension
    const withoutExt = trimmed.replace(/\.(json|md)$/i, '');
    const ext = format === 'json' ? '.json' : '.md';
    return withoutExt + ext;
  };

  const formatEntriesAsMarkdown = (matches: Entry[]): string => {
    // Group matches by entry.date
    const grouped = new Map<string, Entry[]>();
    for (const e of matches) {
      if (!grouped.has(e.date)) grouped.set(e.date, []);
      grouped.get(e.date)!.push(e);
    }

    // Sort group keys descending (string sort works for YYYY-MM-DD)
    const dates = Array.from(grouped.keys()).sort().reverse();

    // Build markdown
    const lines: string[] = [];
    for (const date of dates) {
      lines.push(`## ${date}`);
      // Sort entries by time descending within group
      const entries = grouped.get(date)!.sort((a, b) => b.time.localeCompare(a.time));
      for (const e of entries) {
        lines.push(`**${e.time}** — ${e.text}`);
      }
      lines.push(''); // blank line between groups
    }

    return lines.join('\n');
  };

  // Filter matching (pure, local to App.tsx)
  const getFilterMatches = (rule: FilterRule, allEntries: Entry[]): Entry[] => {
    // Filter allEntries to !e.archived first
    const activeEntries = allEntries.filter(e => !e.archived);

    if (rule.isRemainder) {
      // Remainder rule: return active entries where !others.some(o => e.text.toLowerCase().includes(o.filter.trim().toLowerCase()))
      const otherRules = filterRules.filter(r => !r.isRemainder && r.filter.trim());
      return activeEntries.filter(e => {
        const eLower = e.text.toLowerCase();
        return !otherRules.some(o => eLower.includes(o.filter.trim().toLowerCase()));
      });
    } else {
      // Regular rule: filter by text match
      const trimmed = rule.filter.trim();
      if (!trimmed) return [];
      return activeEntries.filter(e => e.text.toLowerCase().includes(trimmed.toLowerCase()));
    }
  };

  // Handle composing a new entry
  const handleComposerBlur = async () => {
    const trimmed = composerText.trim();
    if (!trimmed) {
      setComposerText('');
      return;
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    try {
      const newEntry = await createEntry(getTodayISO(), timeStr, trimmed);
      setEntries([newEntry, ...entries]);
      setComposerText('');
    } catch (error) {
      console.error('Failed to create entry:', error);
    }
  };

  // Handle editing an entry
  const handleEditSave = async () => {
    if (!editingId) return;

    const trimmed = draftText.trim();
    try {
      await updateEntryText(editingId, trimmed);
      if (trimmed) {
        // Entry was updated
        const updatedEntries = entries.map(e =>
            e.id === editingId ? { ...e, text: trimmed } : e
        );
        setEntries(updatedEntries);
      } else {
        // Entry was deleted (empty text)
        setEntries(entries.filter(e => e.id !== editingId));
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
    }

    setEditingId(null);
    setDraftText('');
  };

  // Handle clicking to edit an entry
  const handleEntryClickToEdit = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      setEditingId(id);
      setDraftText(entry.text);
    }
  };

  // Handle tag click from entry
  const handleTagClick = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
    closeDrawersOnMobile();
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(prev => (prev === date ? null : date));
    closeDrawersOnMobile();
  };

  // Handle removing (archiving) an entry
  const handleEntryRemove = async (id: string) => {
    try {
      await archiveEntry(id);
      setEntries(entries.filter(e => e.id !== id));
      setArchivedCount(c => c + 1);
    } catch (error) {
      console.error('Failed to archive entry:', error);
    }
  };


  // Close drawers on mobile when navigating
  const closeDrawersOnMobile = () => {
    if (isMobile) {
      setLeftOpen(false);
    }
  };

  // Close all drawers
  const closeAllDrawers = () => {
    setLeftOpen(false);
  };

  // Handle hamburger button
  const handleHamburgerClick = () => {
    setLeftOpen(!leftOpen);
  };

  // Handle settings click
  const handleSettingsClick = () => {
    setView('settings');
    closeDrawersOnMobile();
  };

  // Handle archive click
  const handleArchiveClick = () => {
    setView('archive');
    closeDrawersOnMobile();
  };

  // Handle about click
  const handleAboutClick = () => {
    setView('about');
    closeDrawersOnMobile();
  };

  // Handle switch project click
  const handleSwitchProject = () => navigateToPicker();

  // Helper functions for filter sync
  const isRuleSkippable = (rule: FilterRule): boolean => {
    const filterEmpty = !rule.filter.trim();
    const fileNameEmpty = !rule.fileName.trim();
    if (rule.isRemainder) {
      return fileNameEmpty;
    }
    return filterEmpty && fileNameEmpty;
  };

  const getDuplicateFilenameRuleIds = (rules: FilterRule[]): Set<string> => {
    const filenameMap: Record<string, string[]> = {};
    for (const rule of rules) {
      const filename = ensureJsonExtension(rule.fileName);
      if (!filenameMap[filename]) {
        filenameMap[filename] = [];
      }
      filenameMap[filename].push(rule.id);
    }
    const duplicates = new Set<string>();
    for (const [, ids] of Object.entries(filenameMap)) {
      if (ids.length > 1) {
        ids.forEach(id => duplicates.add(id));
      }
    }
    return duplicates;
  };

  // Drive-specific helpers

  // Returns the current Drive folder ID, rediscovering and persisting it
  // if a prior connection never saved it (see setDriveMeta merge fix).
  const ensureDriveFolderId = async (): Promise<string> => {
    if (driveFolderId) {
      return driveFolderId;
    }
    if (!activeProject) {
      throw new Error('activeProject is not set');
    }
    const folderId = await ensureProjectFolderId(
        activeProject.id,
        activeProject.name,
        activeProject.dbName === 'notes-diary'
    );
    setDriveFolderId(folderId);
    await setDriveMeta({ driveFolderId: folderId });
    return folderId;
  };

  const syncFilterRule = async (id: string) => {
    // Look up rule; bail if not found
    const rule = filterRules.find(r => r.id === id);
    if (!rule) {
      console.error(`Rule not found: ${id}`);
      return;
    }
    if (!activeProject) {
      console.error('No active project to sync against');
      return;
    }

    // Set status to 'syncing' (local, do NOT persist mid-flight). Remember
    // the pre-sync status so a failure can revert to it instead of leaving
    // the row stuck on 'syncing' forever (which also disables the button).
    const preSyncStatus = filterSyncState[id]?.status ?? 'pending';
    setFilterSyncStateLocal(prev => ({
      ...prev,
      [id]: { ...prev[id], status: 'syncing' },
    }));

    try {
      const project = drive.project(activeProject.id);

      // Verify connection is still valid before attempting sync
      const connection = await project.getConnection();
      if (!connection) {
        throw new Error('No active connection to Google Drive');
      }
      if (connection.needsReauth) {
        setNeedsReauth(true);
        throw new Error('Google Drive connection expired - re-authentication needed');
      }
      const driveFolderId = await ensureDriveFolderId();
      const localMatches = getFilterMatches(rule, entries);
      const fileName = rule.fileName;

      // Guard: ensure fileName is not empty
      if (!fileName.trim()) {
        console.error(`Rule ${id} has empty fileName`);
        return;
      }

      let driveFileId = filterSyncState[id]?.driveFileId;

      if (!driveFileId) {
        // Self-heal: a file with this name may already exist on Drive (e.g.
        // uploaded from another device) even though this browser never
        // recorded its file ID locally.
        const existingFilename = ensureJsonExtension(fileName);
        const files = await project.files.list({
          folderId: driveFolderId,
          mimeType: 'application/json',
          nameEquals: existingFilename,
        });
        driveFileId = files[0]?.id;
      }

      if (driveFileId) {
        // File exists on Drive — union local with remote (local wins on id collision)
        console.log(`[Sync] Reading existing file ${driveFileId} for rule ${id}`);
        const remoteEntries = await readEntriesFile(project, driveFileId);
        const remoteOnly = remoteEntries.filter(r => !localMatches.find(l => l.id === r.id));
        const merged = localMatches.concat(remoteOnly);

        // Persist remote-only entries locally so they appear in the app
        if (remoteOnly.length > 0) {
          await putEntries(remoteOnly);
          setEntries(prev => prev.concat(remoteOnly.filter(r => !prev.find(l => l.id === r.id))));
        }

        console.log(`[Sync] Writing merged data (${merged.length} entries) to file ${driveFileId}`);
        await project.files.write({
          fileId: driveFileId,
          content: JSON.stringify(merged, null, 2),
          mimeType: 'application/json',
        });
      } else {
        // No remote file yet — create one with local matches
        const filename = ensureJsonExtension(fileName);
        console.log(`[Sync] Creating new file "${filename}" for rule ${id} with ${localMatches.length} entries`);
        const file = await project.files.write({
          folderId: driveFolderId,
          name: filename,
          content: JSON.stringify(localMatches, null, 2),
          mimeType: 'application/json',
        });
        driveFileId = file.id;
        console.log(`[Sync] Created file ${driveFileId}`);
      }

      // Mark as synced with timestamp
      const nextFilterSyncState = {
        ...filterSyncState,
        [id]: {
          status: 'synced' as const,
          lastSynced: Date.now(),
          driveFileId,
        },
      };
      setFilterSyncStateLocal(nextFilterSyncState);

      // Persist sync state
      await setFilterSyncState(nextFilterSyncState);
    } catch (error) {
      const errorMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`Failed to sync filter rule ${id}: ${errorMsg}`, error);

      // If token refresh failed, or the connection is gone entirely (e.g.
      // revoked externally / storage cleared while driveConnected meta still
      // says true), mark as needing re-auth so UI can prompt the user instead
      // of failing silently on every future auto-sync.
      if (error instanceof Error && (error.name === 'NeedsReauthError' || error.message.includes('re-authentication') || error.message.includes('No active connection'))) {
        console.warn(`[Sync] Token issue detected for rule ${id}, marking as needing re-auth`);
        setNeedsReauth(true);
      }

      // Revert to the pre-sync status so the row doesn't stay stuck on
      // 'syncing' (which also keeps the "Sync now" button disabled) — the
      // user needs to be able to retry.
      setFilterSyncStateLocal(prev => ({
        ...prev,
        [id]: { ...prev[id], status: preSyncStatus },
      }));
    }
  };

  const syncAllFilters = async () => {
    const dup = getDuplicateFilenameRuleIds(filterRules);
    const runnable = filterRules.filter(r => !isRuleSkippable(r) && !dup.has(r.id));
    await Promise.all(runnable.map(r => syncFilterRule(r.id)));
  };

  const syncAllNow = async () => {
    // Pull before pushing: this browser may hold no driveFileId at all (a
    // freshly re-created project on a new device) and knows nothing about
    // backup files produced by another device's filter rules.
    await handleDiscoverDriveFolder();
    await syncAllFilters();
  };

  const handleDownloadFilterRule = (ruleId: string, format: 'json' | 'markdown') => {
    const rule = filterRules.find(r => r.id === ruleId);
    if (!rule) {
      console.error(`Filter rule ${ruleId} not found`);
      return;
    }

    const matches = getFilterMatches(rule, entries);
    const content = format === 'json'
      ? JSON.stringify(matches, null, 2)
      : formatEntriesAsMarkdown(matches);

    const filename = getDownloadFilename(rule.fileName, format);

    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/markdown'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSharePermissions = async (fileId: string): Promise<DrivePermission[]> => {
    if (!activeProject) return [];
    return drive.project(activeProject.id).permissions.list(fileId);
  };

  const invitePerson = async (fileId: string, email: string, role: string): Promise<DrivePermission> => {
    if (!activeProject) throw new Error('No active project');
    return drive.project(activeProject.id).permissions.grant({ fileId, type: 'user', role, emailAddress: email });
  };

  const changePersonRole = async (fileId: string, permissionId: string, role: string): Promise<DrivePermission> => {
    if (!activeProject) throw new Error('No active project');
    return drive.project(activeProject.id).permissions.update({ fileId, permissionId, role });
  };

  const removePerson = async (fileId: string, permissionId: string): Promise<void> => {
    if (!activeProject) return;
    return drive.project(activeProject.id).permissions.revoke({ fileId, permissionId });
  };

  const changeGeneralAccess = async (
      fileId: string,
      access: 'restricted' | 'anyone',
      role: string,
      currentGeneralPermissionId?: string
  ): Promise<DrivePermission | void> => {
    if (!activeProject) throw new Error('No active project');
    const project = drive.project(activeProject.id);
    if (access === 'anyone') {
      return project.permissions.grant({ fileId, type: 'anyone', role });
    }
    if (!currentGeneralPermissionId) {
      throw new Error('Cannot restrict access: no existing general permission id provided');
    }
    return project.permissions.revoke({ fileId, permissionId: currentGeneralPermissionId });
  };

  const changeGeneralRole = async (fileId: string, permissionId: string, role: string): Promise<DrivePermission> => {
    if (!activeProject) throw new Error('No active project');
    return drive.project(activeProject.id).permissions.update({ fileId, permissionId, role });
  };

  // Project handlers
  const handleCreateProject = async (name: string) => {
    await createProject(name);
    setProjects(await listProjects());
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    setProjects(await listProjects());
  };

  /**
   * Discovers (or creates) this project's Drive folder and pulls down any
   * backup files already there that a filter rule doesn't yet have a
   * driveFileId for. Preserves the pre-migration layout via
   * `ensureProjectFolderId` (see drive.ts): a per-project subfolder under
   * "Notes Diary", except the legacy migrated project, which uses the
   * top-level folder directly.
   */
  const handleDiscoverDriveFolder = async () => {
    if (!activeProject) return;
    try {
      const project = drive.project(activeProject.id);
      const driveFolderId = await ensureProjectFolderId(
          activeProject.id,
          activeProject.name,
          activeProject.dbName === 'notes-diary'
      );

      setDriveFolderId(driveFolderId);
      await setDriveMeta({ driveFolderId });

      const files = await project.files.list({ folderId: driveFolderId, mimeType: 'application/json' });

      // Build a map of fileName -> file for quick lookup
      const fileMap = new Map(files.map(f => [f.name, f]));

      // Process each filter rule
      const updatedFilterSyncState = { ...filterSyncState };

      // Merge target for both passes below: union-by-id, local wins.
      const localIds = new Set(entries.map(e => e.id));
      const entriesToAdd: Entry[] = [];
      const pullFile = async (fileId: string) => {
        for (const remote of await readEntriesFile(project, fileId)) {
          if (!localIds.has(remote.id)) {
            localIds.add(remote.id);
            entriesToAdd.push(remote);
          }
        }
      };

      // Files a local rule already accounts for — either pulled just now or
      // pulled by an earlier run (which recorded the driveFileId).
      const claimedFileIds = new Set<string>();

      for (const rule of filterRules) {
        const fileName = ensureJsonExtension(rule.fileName);
        const file = fileMap.get(fileName);
        if (!file?.id) continue;
        claimedFileIds.add(file.id);

        // If file exists on Drive and we don't have its driveFileId yet, download it
        if (!filterSyncState[rule.id]?.driveFileId) {
          try {
            await pullFile(file.id);

            // Record the driveFileId in filterSyncState
            updatedFilterSyncState[rule.id] = {
              status: 'synced' as const,
              lastSynced: Date.now(),
              driveFileId: file.id,
            };
          } catch (error) {
            console.error(`Failed to download file for rule ${rule.id}:`, error);
          }
        }
      }

      // Backup files in this project's folder that no local rule references
      // still hold this project's entries: filter rules are local-only and are
      // never stored on Drive, so a browser that re-created the project (same
      // name, new device) knows only its auto-seeded remainder rule and would
      // otherwise ignore every file the other device's rules produced. Pull
      // them read-only — no rule is invented for them, so nothing writes back
      // to those files from here.
      for (const file of files) {
        if (!file.id || claimedFileIds.has(file.id)) continue;
        try {
          await pullFile(file.id);
        } catch (error) {
          console.error(`Failed to download unreferenced Drive file ${file.name}:`, error);
        }
      }

      // Persist everything pulled above
      if (entriesToAdd.length > 0) {
        await putEntries(entriesToAdd);
        setEntries(prev => prev.concat(entriesToAdd.filter(r => !prev.find(l => l.id === r.id))));
      }

      // Persist the updated filterSyncState
      setFilterSyncStateLocal(updatedFilterSyncState);
      await setFilterSyncState(updatedFilterSyncState);
    } catch (error) {
      console.error('Failed to discover Drive folder:', error);
    }
  };

  const connectDrive = async () => {
    if (!activeProject) {
      throw new Error('No active project');
    }
    try {
      // Interactive connect (prompts for consent on first connection, or to
      // re-grant scopes on a reconnect).
      const connection = await drive.project(activeProject.id).connect();

      setDriveConnected(true);
      setDriveAccount(connection.email);
      setNeedsReauth(connection.needsReauth);

      // Persist connection metadata (the token itself lives in drive-sync's
      // own storage, not here).
      await setDriveMeta({
        driveConnected: true,
        driveAccount: connection.email,
      });

      // Verify the connection is working by doing a simple folder lookup.
      // This ensures the token is properly stored and can be used.
      try {
        const project = drive.project(activeProject.id);

        // Give the library a moment to finalize token storage
        // before we try to use the connection
        await new Promise(resolve => setTimeout(resolve, 100));

        const driveFolderId = await ensureProjectFolderId(
          activeProject.id,
          activeProject.name,
          activeProject.dbName === 'notes-diary'
        );
        setDriveFolderId(driveFolderId);

        console.log('[Drive] Connection verified and token is usable');
      } catch (folderError) {
        console.error('[Drive] Failed to verify connection:', folderError);
        throw new Error('Connected to Google account but could not access Drive. Please reconnect.');
      }

      // Discover existing Drive folder and sync state
      await handleDiscoverDriveFolder();
    } catch (error) {
      console.error('Failed to connect Drive:', error);
      // Revert any partial state
      setDriveConnected(false);
      setDriveAccount(undefined);
      throw error;
    }
  };

  // Re-runs the interactive connect flow against the already-active
  // project, to pick up newly-required scopes (see needsReauth banner).
  const reconnectDrive = async () => {
    await connectDrive();
  };

  const disconnectDrive = async () => {
    if (!activeProject) return;
    try {
      // disconnect() only revokes if a token is actually cached, so no
      // need to track/check a driveToken here anymore.
      await drive.project(activeProject.id).disconnect();

      // Clear connection state
      setDriveConnected(false);
      setDriveAccount(undefined);
      setDriveFolderId(undefined);
      setNeedsReauth(false);

      // Clear Drive file IDs from filterSyncState
      const clearedFilterSyncState: Record<string, FileSyncState> = {};
      for (const [ruleId, syncState] of Object.entries(filterSyncState)) {
        clearedFilterSyncState[ruleId] = { ...syncState, driveFileId: undefined };
      }
      setFilterSyncStateLocal(clearedFilterSyncState);

      // Save to storage
      await setDriveMeta({ driveConnected: false });
      await setFilterSyncState(clearedFilterSyncState);
    } catch (error) {
      console.error('Failed to disconnect Drive:', error);
    }
  };

  const showBackdrop = isMobile && leftOpen;

  // Discover Drive folders when on picker route
  useEffect(() => {
    if (route.name !== 'picker') return;

    const discoverFolders = async () => {
      setDriveDiscoveryLoading(true);
      try {
        // Get local projects to compare names
        const localProjects = await listProjects();

        // Loop through projects to find the first one with a valid Drive connection
        let foundProject: Project | undefined;
        for (const p of localProjects) {
          const connection = await drive.project(p.id).getConnection();
          if (connection !== null && !connection.needsReauth) {
            foundProject = p;
            break;
          }
        }

        // If no valid project or empty list, bail out
        if (!foundProject || localProjects.length === 0) {
          setDriveDiscoveredFolders([]);
          return;
        }

        // Get the top-level Drive folder id (pass true for isLegacyProject to use shared folder)
        const folderId = await ensureProjectFolderId(foundProject.id, foundProject.name, true);

        // List immediate child folders
        const folders = await drive.project(foundProject.id).files.list({
          folderId,
          mimeType: 'application/vnd.google-apps.folder',
        });

        // Filter out folders whose names match local project names (case-insensitive, trimmed)
        const filtered = folders.filter(folder => {
          const folderNameLower = folder.name.trim().toLowerCase();
          return !localProjects.some(
            p => p.name.trim().toLowerCase() === folderNameLower
          );
        });

        // Map to {name, modifiedTime}
        const discovered = filtered.map(folder => ({
          name: folder.name,
          modifiedTime: (folder as Record<string, any>).modifiedTime || 'Unknown',
        }));

        setDriveDiscoveredFolders(discovered);
      } catch (error) {
        console.error('Drive discovery error:', error);
        setDriveDiscoveredFolders([]);
      } finally {
        setDriveDiscoveryLoading(false);
      }
    };

    discoverFolders();
  }, [route]);

  // Handle routing: if on project route, load the project; if on picker route, show picker
  useEffect(() => {
    if (!projectsLoaded) return;
    if (route.name === 'project' && route.projectId) {
      const project = projects.find(p => p.id === route.projectId);
      if (project) {
        setActiveProjectDb(project.dbName);
        setActiveProject(project);
      } else {
        // Project not found, redirect to picker
        navigateToPicker();
      }
    }
  }, [route, projects, projectsLoaded]);

  // If on picker route, show ProjectPicker instead of the shell
  if (route.name === 'picker') {
    return (
        <div className="app-layout">
          <ProjectPicker
              projects={projects}
              onCreate={handleCreateProject}
              onDelete={handleDeleteProject}
              onOpen={navigateToProject}
              driveDiscoveredFolders={driveDiscoveredFolders}
              driveDiscoveryLoading={driveDiscoveryLoading}
          />
        </div>
    );
  }

  return (
      <div className="app-layout">
        <LeftRail
            entries={entries}
            selectedTags={selectedTags}
            onTagClick={handleTagClick}
            selectedDate={selectedDate}
            onDateClick={handleDateClick}
            archivedCount={archivedCount}
            onSettingsClick={handleSettingsClick}
            onArchiveClick={handleArchiveClick}
            onAboutClick={handleAboutClick}
            onSwitchProjectClick={handleSwitchProject}
            isMobile={isMobile}
            isOpen={leftOpen}
        />

        <main className="main-content">
          {view === 'diary' && (
              <DiaryView
                  entries={filteredEntries}
                  searchQuery={searchQuery}
                  selectedTags={selectedTags}
                  selectedDate={selectedDate}
                  composerText={composerText}
                  editingId={editingId}
                  editText={draftText}
                  mode={mode}
                  onSearchChange={(q) => {
                    setSearchQuery(q);
                    setEditingId(null);
                  }}
                  onComposerTextChange={setComposerText}
                  onComposerBlur={handleComposerBlur}
                  onEditTextChange={setDraftText}
                  onEditSave={handleEditSave}
                  onTagClick={handleTagClick}
                  onDateClick={handleDateClick}
                  onEntryRemove={handleEntryRemove}
                  onEntryClickToEdit={handleEntryClickToEdit}
                  onHamburgerClick={handleHamburgerClick}
              />
          )}
          {view === 'settings' && (
              <SettingsView
                  driveConnected={driveConnected}
                  driveAccount={driveAccount}
                  needsReauth={needsReauth}
                  filterRules={filterRules}
                  filterSyncState={filterSyncState}
                  filterMatchCounts={Object.fromEntries(filterRules.map(r => [r.id, getFilterMatches(r, entries).length]))}
                  onConnectDrive={connectDrive}
                  onReconnectDrive={reconnectDrive}
                  onDisconnectDrive={disconnectDrive}
                  onSyncAllNow={syncAllNow}
                  onAddFilterRule={addFilterRule}
                  onAddRemainderRule={addRemainderRule}
                  onUpdateFilterRule={updateFilterRule}
                  onRemoveFilterRule={removeFilterRule}
                  onSyncFilterRule={syncFilterRule}
                  onDownloadFilterRule={handleDownloadFilterRule}
                  onLoadSharePermissions={loadSharePermissions}
                  onInvitePerson={invitePerson}
                  onChangePersonRole={changePersonRole}
                  onRemovePerson={removePerson}
                  onChangeGeneralAccess={changeGeneralAccess}
                  onChangeGeneralRole={changeGeneralRole}
                  onBack={() => setView('diary')}
              />
          )}
          {view === 'archive' && (
              <ArchiveView
                  onBackClick={async () => {
                    setView('diary');
                    setArchivedCount(await countArchivedEntries());
                  }}
              />
          )}
          {view === 'about' && <AboutView onBack={() => setView('diary')} />}
        </main>

        {showBackdrop && <Backdrop onClose={closeAllDrawers} />}
      </div>
  );
}

export default App;
