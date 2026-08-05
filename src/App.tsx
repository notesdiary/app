import { useState, useEffect, useCallback } from 'react';
import { Entry, FileSyncState, FilterRule, Project } from './types';
import { getTodayISO } from './lib/dateUtils';
import { deriveMode } from './lib/mode';
import { filterEntries, filterParagraphsInEntry } from './lib/entryFiltering';
import { listAllEntries, createEntry, updateEntryText, archiveEntry, putEntries, countArchivedEntries } from './lib/entriesRepo';
import { getDriveMeta, setDriveMeta, getFilterRules, setFilterRules, getFilterSyncState, setFilterSyncState } from './lib/metaRepo';
import { getAccessToken, requestAccessToken, revokeToken, getAuthStatus } from './lib/googleAuth';
import { findOrCreateAppFolder, findOrCreateSubfolder, listBackupFiles, uploadNamedFile, deleteFile, ensureJsonExtension, downloadFileContent, DrivePermission, listPermissions, createPermission, createAnyonePermission, updatePermission, deletePermission } from './lib/driveApi';
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
  const [driveToken, setDriveToken] = useState<string | undefined>();

  // State: filter sync rules
  const [filterRules, setFilterRulesLocal] = useState<FilterRule[]>([]);
  const [filterSyncState, setFilterSyncStateLocal] = useState<Record<string, FileSyncState>>({});

  // State: UI filters and mode
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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

  // Load projects from registry on mount
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      await migrateLegacyDbIfNeeded();
      setProjects(await listProjects());
      setProjectsLoaded(true);
    })();
  }, []);

  // Get the current route
  const route = useHashRoute();

  // Load entries from IndexedDB on mount (guarded by activeProject)
  useEffect(() => {
    if (!activeProject) return;

    (async () => {
      const allEntries = await listAllEntries();
      setEntries(allEntries);
      setArchivedCount(await countArchivedEntries());

      // Load Drive metadata
      const driveMeta = await getDriveMeta();
      setDriveConnected(driveMeta.driveConnected);
      if (driveMeta.driveAccount) setDriveAccount(driveMeta.driveAccount);
      if (driveMeta.driveFolderId) setDriveFolderId(driveMeta.driveFolderId);

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
        await syncAllNow();
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(intervalId);
  }, [driveConnected, filterRules]);

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
  const filteredEntries = filterEntries(entries, mode, selectedTags, searchQuery);

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
  const ensureDriveFolderId = async (token: string): Promise<string> => {
    if (driveFolderId) {
      return driveFolderId;
    }
    const folderId = await findOrCreateAppFolder(token);
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
        const remoteContent = await downloadFileContent(token, driveFileId);
        const remoteEntries: Entry[] = Array.isArray(remoteContent) ? remoteContent : [];
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

  const syncAllFilters = async () => {
    const dup = getDuplicateFilenameRuleIds(filterRules);
    const runnable = filterRules.filter(r => !isRuleSkippable(r) && !dup.has(r.id));
    await Promise.all(runnable.map(r => syncFilterRule(r.id)));
  };

  const syncAllNow = async () => {
    await syncAllFilters();
  };

  const loadSharePermissions = async (fileId: string): Promise<DrivePermission[]> => {
    const token = await getAccessToken();
    return listPermissions(token, fileId);
  };

  const invitePerson = async (fileId: string, email: string, role: string): Promise<DrivePermission> => {
    const token = await getAccessToken();
    return createPermission(token, fileId, { emailAddress: email, role });
  };

  const changePersonRole = async (fileId: string, permissionId: string, role: string): Promise<DrivePermission> => {
    const token = await getAccessToken();
    return updatePermission(token, fileId, permissionId, role);
  };

  const removePerson = async (fileId: string, permissionId: string): Promise<void> => {
    const token = await getAccessToken();
    return deletePermission(token, fileId, permissionId);
  };

  const changeGeneralAccess = async (
    fileId: string,
    access: 'restricted' | 'anyone',
    role: string,
    currentGeneralPermissionId?: string
  ): Promise<DrivePermission | void> => {
    const token = await getAccessToken();
    if (access === 'anyone') {
      return createAnyonePermission(token, fileId, role);
    }
    if (!currentGeneralPermissionId) {
      throw new Error('Cannot restrict access: no existing general permission id provided');
    }
    return deletePermission(token, fileId, currentGeneralPermissionId);
  };

  const changeGeneralRole = async (fileId: string, permissionId: string, role: string): Promise<DrivePermission> => {
    const token = await getAccessToken();
    return updatePermission(token, fileId, permissionId, role);
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

  const handleDiscoverDriveFolder = async (token: string) => {
    try {
      const topLevelFolderId = await findOrCreateAppFolder(token);

      // Branch behavior based on whether project is migrated or new
      let driveFolderId: string;
      if (activeProject?.dbName === 'notes-diary') {
        // Migrated project: use top-level folder directly
        driveFolderId = topLevelFolderId;
      } else {
        // New project: create a subfolder with the project name
        if (!activeProject) {
          throw new Error('activeProject is not set');
        }
        const subfolderFolderId = await findOrCreateSubfolder(token, topLevelFolderId, activeProject.name);
        driveFolderId = subfolderFolderId;
      }

      setDriveFolderId(driveFolderId);
      await setDriveMeta({ driveFolderId });

      const files = await listBackupFiles(token, driveFolderId);

      // Build a map of fileName -> file for quick lookup
      const fileMap = new Map(files.map(f => [f.name, f]));

      // Process each filter rule
      const updatedFilterSyncState = { ...filterSyncState };

      for (const rule of filterRules) {
        const fileName = ensureJsonExtension(rule.fileName);
        const file = fileMap.get(fileName);

        // If file exists on Drive and we don't have its driveFileId yet, download it
        if (file && !filterSyncState[rule.id]?.driveFileId) {
          try {
            const remoteContent = await downloadFileContent(token, file.id);
            const remoteEntries: Entry[] = Array.isArray(remoteContent) ? remoteContent : [];

            // Merge: union-by-id, local-wins on collision
            const localIds = new Set(entries.map(e => e.id));
            const entriesToAdd = remoteEntries.filter(r => !localIds.has(r.id));

            // Persist remote-only entries locally
            if (entriesToAdd.length > 0) {
              await putEntries(entriesToAdd);
              setEntries(prev => prev.concat(entriesToAdd.filter(r => !prev.find(l => l.id === r.id))));
            }

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

      // Persist the updated filterSyncState
      setFilterSyncStateLocal(updatedFilterSyncState);
      await setFilterSyncState(updatedFilterSyncState);
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

  const disconnectDrive = async () => {
    try {
      if (driveToken) {
        await revokeToken(driveToken);
      }

      // Clear connection state
      setDriveConnected(false);
      setDriveAccount(undefined);
      setDriveFolderId(undefined);
      setDriveToken(undefined);

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
          />
        )}
        {view === 'settings' && (
          <SettingsView
            driveConnected={driveConnected}
            driveAccount={driveAccount}
            filterRules={filterRules}
            filterSyncState={filterSyncState}
            filterMatchCounts={Object.fromEntries(filterRules.map(r => [r.id, getFilterMatches(r, entries).length]))}
            onConnectDrive={connectDrive}
            onDisconnectDrive={disconnectDrive}
            onSyncAllNow={syncAllNow}
            onAddFilterRule={addFilterRule}
            onAddRemainderRule={addRemainderRule}
            onUpdateFilterRule={updateFilterRule}
            onRemoveFilterRule={removeFilterRule}
            onSyncFilterRule={syncFilterRule}
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
