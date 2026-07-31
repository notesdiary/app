import { useState } from 'react';
import { FileSyncState, FilterRule } from '../types';
import './SettingsView.css';

interface SettingsViewProps {
  driveConnected: boolean;
  driveAccount?: string;
  filterRules: FilterRule[];
  filterSyncState: Record<string, FileSyncState>;
  filterMatchCounts: Record<string, number>;
  onConnectDrive: () => Promise<void>;
  onDisconnectDrive: (deleteLocal: boolean) => Promise<void>;
  onSyncAllNow: () => Promise<void>;
  onAddFilterRule: () => Promise<void>;
  onAddRemainderRule: () => Promise<void>;
  onUpdateFilterRule: (id: string, field: 'filter' | 'fileName', value: string) => Promise<void>;
  onRemoveFilterRule: (id: string, alsoDeleteFromDrive: boolean) => Promise<void>;
  onSyncFilterRule: (id: string) => Promise<void>;
  onBack: () => void;
}

// Helper functions (6.1)
function ensureJsonExtension(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.endsWith('.json')) {
    return trimmed;
  }
  return trimmed + '.json';
}

function getDuplicateFilenameRuleIds(rules: FilterRule[]): Set<string> {
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
}

export function SettingsView(props: SettingsViewProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | undefined>(undefined);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [pendingRemoveRuleId, setPendingRemoveRuleId] = useState<string | null>(null);

  const handleConnectClick = async () => {
    setIsConnecting(true);
    setConnectError(undefined);
    try {
      await props.onConnectDrive();
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Failed to connect to Google Drive');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectConfirm = async (deleteLocal: boolean) => {
    await props.onDisconnectDrive(deleteLocal);
    setShowDisconnectDialog(false);
  };

  const handleSyncAllNow = async () => {
    try {
      await props.onSyncAllNow();
    } catch (error) {
      console.error('Failed to sync all:', error);
    }
  };

  const handleRemoveRuleConfirm = async (id: string, alsoDeleteFromDrive: boolean) => {
    await props.onRemoveFilterRule(id, alsoDeleteFromDrive);
    setPendingRemoveRuleId(null);
  };

  const getStatusText = (_key: string, state: FileSyncState | undefined): string => {
    if (!state) return '';
    if (state.status === 'syncing') return 'Syncing…';
    if (state.status === 'remote-pending')
      return 'Backed up in Drive, not yet downloaded';
    if (state.status === 'synced') {
      if (state.lastSynced) {
        const date = new Date(state.lastSynced);
        const formatted = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return `Synced ${formatted}`;
      }
      return 'Synced';
    }
    if (state.status === 'pending') return 'Not yet synced';
    return '';
  };

  return (
    <div className="settings-view">
      <div className="settings-header">
        <button className="back-button" onClick={props.onBack} title="Back to diary">
          ← Back to diary
        </button>
      </div>

      <div className="settings-content">
        <div className="settings-title-section">
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Backup and sync your notes.</p>
        </div>

        <div className="settings-card">
          <div className="card-eyebrow">GOOGLE DRIVE BACKUP</div>

          {!props.driveConnected ? (
            <div className="disconnected-state">
              <button
                className="connect-button"
                onClick={handleConnectClick}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting…' : 'Connect Google Drive'}
              </button>

              <p className="connect-explanation">
                While connected, entries matching your filters get backed up to their own file in Drive, and sync automatically. If you edit a file directly in Drive, I pick up those changes the next time I sync.
              </p>

              {connectError && (
                <p className="connect-error">{connectError}</p>
              )}
            </div>
          ) : (
            <div className="connected-state">
              <div className="account-chip">
                <span className="account-avatar">G</span>
                <div className="account-info">
                  <span className="account-status">Connected</span>
                  <span className="account-email">{props.driveAccount}</span>
                </div>
              </div>

              <button
                className="disconnect-button"
                onClick={() => setShowDisconnectDialog(true)}
              >
                Disconnect
              </button>

              {/* Filter sync mode UI */}
              <>
                {/* Explanatory copy */}
                <div className="filter-mode-section">
                  <p className="filter-mode-explanation">
                    Only entries matching a filter get backed up, each rule to its own file. Everything else stays local.
                  </p>

                  {/* Filter rule editor */}
                  <div className="filter-rule-editor">
                    {props.filterRules.map((rule) => {
                      const duplicates = getDuplicateFilenameRuleIds(props.filterRules);
                      const isDuplicate = duplicates.has(rule.id);
                      const filename = ensureJsonExtension(rule.fileName);

                      return (
                        <div key={rule.id} className="filter-rule-row">
                          {rule.isRemainder ? (
                            <div className="filter-rule-remainder-box">
                              Everything else
                            </div>
                          ) : (
                            <input
                              type="text"
                              className="filter-rule-input"
                              placeholder="Filter, e.g. #project-atlas"
                              value={rule.filter}
                              onChange={(e) => props.onUpdateFilterRule(rule.id, 'filter', e.target.value)}
                            />
                          )}

                          <span className="filter-rule-separator">→</span>

                          <div className="filter-rule-filename-wrapper">
                            <input
                              type="text"
                              className="filter-rule-input"
                              placeholder="filename.json"
                              value={rule.fileName}
                              onChange={(e) => props.onUpdateFilterRule(rule.id, 'fileName', e.target.value)}
                            />
                            {isDuplicate && (
                              <p className="filename-error">
                                This filename is used by another rule — pick a unique name.
                              </p>
                            )}
                          </div>

                          <button
                            className="filter-rule-remove-button"
                            onClick={() => setPendingRemoveRuleId(rule.id)}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add buttons */}
                  <div className="add-filter-row">
                    <button
                      className="add-filter-button"
                      onClick={props.onAddFilterRule}
                    >
                      + Add filter
                    </button>
                    {!props.filterRules.some(r => r.isRemainder) && (
                      <button
                        className="add-remainder-button"
                        onClick={props.onAddRemainderRule}
                      >
                        + Add "everything else" filter
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter-mode backup files list */}
                {props.filterRules.filter(r => !r.isRemainder || props.filterRules.some(x => x.isRemainder)).length > 0 && (
                  <div className="backup-files-section">
                    <h3 className="backup-files-title">Backup files</h3>
                    <div className="backup-files-list">
                      {props.filterRules.map((rule) => {
                        const state = props.filterSyncState[rule.id];
                        const statusText = getStatusText(rule.id, state);
                        const isSyncing = state?.status === 'syncing';
                        const duplicates = getDuplicateFilenameRuleIds(props.filterRules);
                        const isDuplicate = duplicates.has(rule.id);
                        const isSkippable = !rule.fileName.trim();

                        let statusDotColor = '#999';
                        if (state?.status === 'pending') statusDotColor = '#FF8200';
                        if (state?.status === 'remote-pending') statusDotColor = '#00A9CE';
                        if (state?.status === 'synced') statusDotColor = '#00A9CE';

                        const isDisabled = isSyncing || isDuplicate || isSkippable;

                        return (
                          <div key={rule.id} className="backup-file-row">
                            <div className="file-info">
                              <span
                                className="status-dot"
                                style={{ backgroundColor: statusDotColor }}
                              />
                              <div className="file-details">
                                <span className="file-name">
                                  {ensureJsonExtension(rule.fileName) || 'untitled.json'}
                                </span>
                                <span className="file-meta">
                                  {props.filterMatchCounts[rule.id] || 0} entry
                                  {(props.filterMatchCounts[rule.id] || 0) !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            <div className="file-status">
                              <span className="status-text">{statusText}</span>
                              <button
                                className="sync-now-button"
                                onClick={() => props.onSyncFilterRule(rule.id)}
                                disabled={isDisabled}
                              >
                                Sync now
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>

              {/* Remove filter rule modal (6.4) */}
              {pendingRemoveRuleId && (
                <div className="modal-overlay" onClick={() => setPendingRemoveRuleId(null)}>
                  <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2 className="modal-title">Remove this filter rule?</h2>

                    <p className="modal-body">
                      The Drive file won't be deleted unless you choose to. You can always restore entries by re-syncing the file.
                    </p>

                    <div className="modal-actions">
                      <button
                        className="modal-button modal-button-bordered"
                        onClick={() => handleRemoveRuleConfirm(pendingRemoveRuleId, false)}
                      >
                        Keep the Drive file, just stop syncing it
                      </button>
                      <button
                        className="modal-button modal-button-cyan"
                        onClick={() => handleRemoveRuleConfirm(pendingRemoveRuleId, true)}
                      >
                        Also delete the file from Drive
                      </button>
                      <button
                        className="modal-button modal-button-cancel"
                        onClick={() => setPendingRemoveRuleId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="sync-footer">
                <button className="sync-all-button" onClick={handleSyncAllNow}>
                  Sync filters now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDisconnectDialog && (
        <div className="modal-overlay" onClick={() => setShowDisconnectDialog(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Disconnect Google Drive?</h2>

            <p className="modal-body">
              You can disconnect and keep both your local notes and Drive backups. Or, remove all
              local notes that are already backed up. You can always restore them from Drive later.
            </p>

            <div className="modal-actions">
              <button
                className="modal-button modal-button-cyan"
                onClick={() => handleDisconnectConfirm(false)}
              >
                Just disconnect — keep both copies
              </button>
              <button
                className="modal-button modal-button-bordered"
                onClick={() => handleDisconnectConfirm(true)}
              >
                Disconnect and delete local copies
              </button>
              <button
                className="modal-button modal-button-cancel"
                onClick={() => setShowDisconnectDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
