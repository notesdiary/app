export type Entry = {
  id: string;
  date: string;  // ISO YYYY-MM-DD
  time: string;  // HH:MM
  text: string;
  archived?: boolean;
  createdAt: number;  // epoch ms
};

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'remote-pending';

export type FilterRule = {
  id: string;
  filter: string;
  fileName: string;
  isRemainder: boolean;
};

// Reused for per-rule sync state: Record<ruleId, FileSyncState>
export type FileSyncState = {
  status: SyncStatus;
  lastSynced?: number;  // epoch ms
  driveFileId?: string;
};

export type DriveMeta = {
  driveConnected: boolean;
  driveAccount?: string;
  driveFolderId?: string;
};
