import { useState, useEffect, useCallback } from 'react';
import { Entry, FileSyncState, SyncMode, FilterRule } from './types';
import { getTodayISO } from './lib/dateUtils';
import { deriveMode } from './lib/mode';
import { filterEntries, filterParagraphsInEntry } from './lib/entryFiltering';
import { listAllEntries, createEntry, updateEntryText, archiveEntry, putEntries } from './lib/entriesRepo';
import { getExtraDates, addExtraDate, getDriveMeta, setDriveMeta, getFileSyncState, setFileSyncState, getSyncMode, setSyncMode, getFilterRules, setFilterRules, getFilterSyncState, setFilterSyncState } from './lib/metaRepo';
import { getAccessToken, requestAccessToken, revokeToken, getAuthStatus } from './lib/googleAuth';
import { findOrCreateAppFolder, listBackupFiles, uploadMonthFile, downloadMonthFile, extractMonthFromFilename, uploadNamedFile, deleteFile, ensureJsonExtension } from './lib/driveApi';
import { useWindowWidth } from './hooks/useWindowWidth';
import { LeftRail } from './components/LeftRail';
import { RightRail } from './components/RightRail';
import { DiaryView } from './components/DiaryView';
import { ArchiveView } from './components/ArchiveView';
import { SettingsView } from './components/SettingsView';
import { AboutView } from './components/AboutView';
import { Backdrop } from './components/Backdrop';
import './App.css';

type ViewType = 'diary' | 'settings' | 'archive' | 'about';

function App() {
  // State: entries and metadata
  const [entries, setEntries] = useState<Entry[]>([]);
  const [extraDates, setExtraDates] = useState<string[]>([]);

  // State: Google Drive
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveAccount, setDriveAccount] = useState<string | undefined>();
  const [driveFolderId, setDriveFolderId] = useState<string | undefined>();
  const [driveToken, setDriveToken] = useState<string | undefined>();
  const [fileSyncState, setFileSyncStateLocal] = useState<Record<string, FileSyncState>>({});

  // State: filter sync mode and rules
  const [syncMode, setSyncModeLocal] = useState<SyncMode>('all');
  const [filterRules, setFilterRulesLocal] = useState<FilterRule[]>([]);
  const [filterSyncState, setFilterSyncStateLocal] = useState<Record<string, FileSyncState>>({});

  // State: UI filters and mode
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // State: editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  // State: composer
  const [composerText, setComposerText] = useState('');

  // State: navigation
  const [view, setView] = useState<ViewType>('diary');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // State: responsive UI
  const width = useWindowWidth();
  const isMobile = width < 960;
  const [leftOpen, setLeftOpen] = useState(!isMobile);
  const [rightOpen, setRightOpen] = useState(!isMobile);

  // Load entries from IndexedDB on mount
  useEffect(() => {
    (async () => {
      const allEntries = await listAllEntries();
      setEntries(allEntries);

      const dates = await getExtraDates();
      setExtraDates(dates);

      // Load Drive metadata
      const driveMeta = await getDriveMeta();
      setDriveConnected(driveMeta.driveConnected);
      if (driveMeta.driveAccount) setDriveAccount(driveMeta.driveAccount);
      if (driveMeta.driveFolderId) setDriveFolderId(driveMeta.driveFolderId);

      // Load file sync state (for months)
      const syncState = await getFileSyncState();
      setFileSyncStateLocal(syncState);

      // Load filter sync mode and rules
      const mode = await getSyncMode();
      setSyncModeLocal(mode);

      const rules = await getFilterRules();
      setFilterRulesLocal(rules);

      const filterSync = await getFilterSyncState();
      setFilterSyncStateLocal(filterSync);
    })();
  }, []);

  // Update window state on mobile/desktop transition
  useEffect(() => {
    if (!isMobile) {
      setLeftOpen(true);
      setRightOpen(true);
    }
  }, [isMobile]);

  // Auto-sync to Drive every 5 minutes when connected
  useEffect(() => {
    if (!driveConnected) return;

    const intervalId = setInterval(async () => {
      try {
        await syncAllNow();
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(intervalId);
  }, [driveConnected, syncMode, filterRules, fileSyncState]);

  // Verify and maintain Drive connection, attempt silent reconnect if needed
  useEffect(() => {
    if (!driveConnected) return;

    const checkConnection = async () => {
      try {
        // Attempt to get a valid token (silent refresh if needed)
        await getAccessToken();
      } catch (error) {
        // Connection lost, mark as disconnected
        console.warn('Drive connection lost:', error);
        setDriveConnected(false);
        await setDriveMeta({ driveConnected: false });
      }
    };

    // Check every 1 minute
    const intervalId = setInterval(checkConnection, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [driveConnected]);

  // Derive the current mode
  const mode = deriveMode(searchQuery, selectedTags);

  // Filter entries based on current mode and filters
  const filteredEntries = filterEntries(entries, mode, selectedDate, selectedTags, searchQuery);

  // Mode switching (non-destructive)
  const setSyncModeAll = async () => {
    setSyncModeLocal('all');
    await setSyncMode('all');
  };

  const setSyncModeFilters = async () => {
    const rules = filterRules.length ? filterRules : [{ id: 'fr-' + crypto.randomUUID(), filter: '', fileName: '', isRemainder: false }];
    setFilterRulesLocal(rules);
    setSyncModeLocal('filters');
    await setSyncMode('filters');
    await setFilterRules(rules);
  };

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
    if (alsoDeleteFromDrive && filterSyncState[id]?.driveFileId) {
      try {
        const token = await getAccessToken();
        await deleteFile(token, filterSyncState[id].driveFileId!);
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
      const newEntry = await createEntry(selectedDate, timeStr, trimmed);
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

  // Handle removing (archiving) an entry
  const handleEntryRemove = async (id: string) => {
    try {
      await archiveEntry(id);
      setEntries(entries.filter(e => e.id !== id));
    } catch (error) {
      console.error('Failed to archive entry:', error);
    }
  };

  // Handle selecting a date
  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedTags([]);
    setSearchQuery('');
    setEditingId(null);
    setView('diary');
    closeDrawersOnMobile();
  };

  // Handle adding an extra date
  const handleAddExtraDate = async (date: string) => {
    try {
      await addExtraDate(date);
      setExtraDates(prev => [...new Set([...prev, date])]);
    } catch (error) {
      console.error('Failed to add extra date:', error);
    }
  };

  // Close drawers on mobile when navigating
  const closeDrawersOnMobile = () => {
    if (isMobile) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  };

  // Close both drawers
  const closeAllDrawers = () => {
    setLeftOpen(false);
    setRightOpen(false);
  };

  // Handle hamburger button
  const handleHamburgerClick = () => {
    setLeftOpen(!leftOpen);
    if (rightOpen) {
      setRightOpen(false);
    }
  };

  // Handle tag button
  const handleTagButtonClick = () => {
    setRightOpen(!rightOpen);
    if (leftOpen) {
      setLeftOpen(false);
    }
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
  const ensureDriveFolderId = async (token: string): Promise<string> => {
    if (driveFolderId) {
      return driveFolderId;
    }
    const folderId = await findOrCreateAppFolder(token);
    setDriveFolderId(folderId);
    await setDriveMeta({ driveFolderId: folderId });
    return folderId;
  };

  const syncMonth = async (monthKey: string, driveFileIdOverride?: string) => {
    setFileSyncStateLocal(prev => ({
      ...prev,
      [monthKey]: { ...prev[monthKey], status: 'syncing' },
    }));

    try {
      // Get a valid access token (refreshes if needed)
      const token = await getAccessToken();
      const driveFolderId = await ensureDriveFolderId(token);

      // Get local entries for this month (active entries only)
      const localEntries = entries.filter(
        e => e.date.startsWith(monthKey) && !e.archived
      );

      // Get Drive file ID if sync was previously attempted. An override may
      // be passed in when the caller just ran discovery in this same call
      // chain — React state from that discovery hasn't re-rendered yet, so
      // fileSyncState here would otherwise still be stale.
      const driveFileId = driveFileIdOverride ?? fileSyncState[monthKey]?.driveFileId;
      let driveFileIdForState = driveFileId;

      // Sync strategy: merge local + remote (local wins on ID collision)
      if (driveFileId) {
        // File exists on Drive — fetch remote, merge, and upload
        const remoteEntries = await downloadMonthFile(token, driveFileId);
        const remoteOnly = remoteEntries.filter(r => !localEntries.find(l => l.id === r.id));
        const merged = localEntries.concat(remoteOnly);

        // Persist remote-only entries locally so they appear in the app
        if (remoteOnly.length > 0) {
          await putEntries(remoteOnly);
          setEntries(prev => prev.concat(remoteOnly.filter(r => !prev.find(l => l.id === r.id))));
        }

        await uploadMonthFile(token, driveFolderId, monthKey, merged, driveFileId);
      } else {
        // No remote file yet — create one with local entries
        const fileId = await uploadMonthFile(token, driveFolderId, monthKey, localEntries);
        driveFileIdForState = fileId;
      }

      // Mark as synced with timestamp
      const nextFileSyncState = {
        ...fileSyncState,
        [monthKey]: {
          status: 'synced' as const,
          lastSynced: Date.now(),
          driveFileId: driveFileIdForState,
        },
      };
      setFileSyncStateLocal(nextFileSyncState);

      // Persist sync state
      await setFileSyncState(nextFileSyncState);
    } catch (error) {
      console.error(`Failed to sync month ${monthKey}:`, error);
      // Leave status as 'pending' or 'syncing' — user can retry
    }
  };

  const syncFilterRule = async (id: string) => {
    // Look up rule; bail if not found
    const rule = filterRules.find(r => r.id === id);
    if (!rule) {
      console.error(`Rule not found: ${id}`);
      return;
    }

    // Set status to 'syncing' (local, do NOT persist mid-flight)
    setFilterSyncStateLocal(prev => ({
      ...prev,
      [id]: { ...prev[id], status: 'syncing' },
    }));

    try {
      const token = await getAccessToken();
      const driveFolderId = await ensureDriveFolderId(token);
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
        const files = await listBackupFiles(token, driveFolderId);
        driveFileId = files.find(f => f.name === existingFilename)?.id;
      }

      if (driveFileId) {
        // File exists on Drive — union local with remote (local wins on id collision)
        const remoteEntries = await downloadMonthFile(token, driveFileId);
        const remoteOnly = remoteEntries.filter(r => !localMatches.find(l => l.id === r.id));
        const merged = localMatches.concat(remoteOnly);

        // Persist remote-only entries locally so they appear in the app
        if (remoteOnly.length > 0) {
          await putEntries(remoteOnly);
          setEntries(prev => prev.concat(remoteOnly.filter(r => !prev.find(l => l.id === r.id))));
        }

        await uploadNamedFile(token, driveFolderId, fileName, merged, driveFileId);
      } else {
        // No remote file yet — create one with local matches
        const fileId = await uploadNamedFile(token, driveFolderId, fileName, localMatches);
        driveFileId = fileId;
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
      console.error(`Failed to sync filter rule ${id}:`, error);
      // Leave status as-is — user can retry
    }
  };

  const syncAllMonths = async () => {
    // Re-discover first: months that exist only in Drive (created on another
    // device, or added since the last discovery) aren't in fileSyncState yet
    // and would otherwise never be picked up for syncing.
    const token = await getAccessToken();
    const discovered = await handleDiscoverDriveFolder(token);
    const stateToUse = discovered ?? fileSyncState;
    const monthKeys = Object.keys(stateToUse);
    await Promise.all(monthKeys.map(key => syncMonth(key, stateToUse[key]?.driveFileId)));
  };

  const syncAllFilters = async () => {
    const dup = getDuplicateFilenameRuleIds(filterRules);
    const runnable = filterRules.filter(r => !isRuleSkippable(r) && !dup.has(r.id));
    await Promise.all(runnable.map(r => syncFilterRule(r.id)));
  };

  const syncAllNow = async () => {
    if (syncMode === 'filters') {
      await syncAllFilters();
    } else {
      await syncAllMonths();
    }
  };

  const handleDiscoverDriveFolder = async (token: string): Promise<Record<string, FileSyncState> | undefined> => {
    try {
      const folderId = await findOrCreateAppFolder(token);
      setDriveFolderId(folderId);
      await setDriveMeta({ driveFolderId: folderId });

      const files = await listBackupFiles(token, folderId);
      const fileMonthKeys = new Set(
        files.map(f => extractMonthFromFilename(f.name)).filter((m): m is string => m !== null)
      );
      const localMonthKeys = new Set(entries.map(e => e.date.slice(0, 7)));

      const newSyncState: Record<string, FileSyncState> = {};
      const localMonthKeysArray = Array.from(localMonthKeys) as string[];
      const fileMonthKeysArray = Array.from(fileMonthKeys) as string[];

      for (const monthKey of localMonthKeysArray) {
        const driveFileId = files.find((f: any) => {
          const mKey = extractMonthFromFilename(f.name);
          return mKey === monthKey;
        })?.id;
        newSyncState[monthKey] = { status: 'pending', driveFileId };
      }
      for (const monthKey of fileMonthKeysArray) {
        if (!localMonthKeys.has(monthKey)) {
          const driveFileId = files.find((f: any) => {
            const mKey = extractMonthFromFilename(f.name);
            return mKey === monthKey;
          })?.id;
          newSyncState[monthKey] = { status: 'remote-pending', driveFileId };
        }
      }

      setFileSyncStateLocal(newSyncState);
      await setFileSyncState(newSyncState);
      return newSyncState;
    } catch (error) {
      console.error('Failed to discover Drive folder:', error);
    }
  };

  const connectDrive = async () => {
    try {
      // Request access token with consent prompt (first connection)
      const token = await requestAccessToken('consent');

      // Fetch authenticated user's email from Drive API
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user',
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error(`Drive API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const email = data.user?.emailAddress;

      if (!email) {
        throw new Error('Could not fetch user email from Drive');
      }

      // Store in state (token in memory only, not persisted)
      setDriveConnected(true);
      setDriveAccount(email);
      setDriveToken(token);

      // Persist connection metadata (but not the token)
      await setDriveMeta({
        driveConnected: true,
        driveAccount: email,
      });

      // Discover existing Drive folder and sync state
      await handleDiscoverDriveFolder(token);
    } catch (error) {
      console.error('Failed to connect Drive:', error);
      // Revert any partial state
      setDriveConnected(false);
      setDriveAccount(undefined);
      setDriveToken(undefined);
      throw error;
    }
  };

  const disconnectDrive = async (deleteLocal: boolean) => {
    try {
      if (driveToken) {
        await revokeToken(driveToken);
      }

      if (deleteLocal) {
        // Delete all entries in months with ANY sync state
        const monthKeysToDelete = new Set(Object.keys(fileSyncState));
        const remainingEntries = entries.filter(
          e => !monthKeysToDelete.has(e.date.slice(0, 7))
        );
        setEntries(remainingEntries);
        // Note: actual deletion from IndexedDB should be done here if needed
      }

      // Clear connection state
      setDriveConnected(false);
      setDriveAccount(undefined);
      setDriveFolderId(undefined);
      setDriveToken(undefined);
      setFileSyncStateLocal({});

      // Save to storage
      await setDriveMeta({ driveConnected: false });
      await setFileSyncState({});
    } catch (error) {
      console.error('Failed to disconnect Drive:', error);
    }
  };

  const showBackdrop = isMobile && (leftOpen || rightOpen);

  return (
    <div className="app-layout">
      <LeftRail
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        onAddExtraDate={handleAddExtraDate}
        entries={entries}
        extraDates={extraDates}
        onSettingsClick={handleSettingsClick}
        onArchiveClick={handleArchiveClick}
        onAboutClick={handleAboutClick}
        isMobile={isMobile}
        isOpen={leftOpen}
      />

      <main className="main-content">
        {view === 'diary' && (
          <DiaryView
            entries={filteredEntries}
            selectedDate={selectedDate}
            searchQuery={searchQuery}
            selectedTags={selectedTags}
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
            onEntryRemove={handleEntryRemove}
            onEntryClickToEdit={handleEntryClickToEdit}
            onHamburgerClick={handleHamburgerClick}
            onTagButtonClick={handleTagButtonClick}
            isMobile={isMobile}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            driveConnected={driveConnected}
            driveAccount={driveAccount}
            fileSyncState={fileSyncState}
            syncMode={syncMode}
            filterRules={filterRules}
            filterSyncState={filterSyncState}
            filterMatchCounts={Object.fromEntries(filterRules.map(r => [r.id, getFilterMatches(r, entries).length]))}
            monthMatchCounts={Object.fromEntries(Object.keys(fileSyncState).map(monthKey => [monthKey, entries.filter(e => e.date.startsWith(monthKey) && !e.archived).length]))}
            onConnectDrive={connectDrive}
            onDisconnectDrive={disconnectDrive}
            onSyncAllNow={syncAllNow}
            onSetSyncModeAll={setSyncModeAll}
            onSetSyncModeFilters={setSyncModeFilters}
            onAddFilterRule={addFilterRule}
            onAddRemainderRule={addRemainderRule}
            onUpdateFilterRule={updateFilterRule}
            onRemoveFilterRule={removeFilterRule}
            onSyncFilterRule={syncFilterRule}
            onBack={() => setView('diary')}
          />
        )}
        {view === 'archive' && <ArchiveView onBackClick={() => setView('diary')} />}
        {view === 'about' && <AboutView onBack={() => setView('diary')} />}
      </main>

      {!isMobile && (
        <RightRail
          entries={entries}
          selectedTags={selectedTags}
          onTagClick={handleTagClick}
          isMobile={false}
          isOpen={true}
        />
      )}

      {isMobile && (
        <RightRail
          entries={entries}
          selectedTags={selectedTags}
          onTagClick={handleTagClick}
          isMobile={true}
          isOpen={rightOpen}
        />
      )}

      {showBackdrop && <Backdrop onClose={closeAllDrawers} />}
    </div>
  );
}

export default App;
