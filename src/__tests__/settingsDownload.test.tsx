import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from '../components/SettingsView';
import { FilterRule, FileSyncState } from '../types';

const createMockProps = (overrides = {}) => ({
  driveConnected: true,
  driveAccount: 'test@example.com',
  needsReauth: false,
  filterRules: [
    {
      id: 'rule1',
      filter: '#project',
      fileName: 'project-backup',
      isRemainder: false,
    } as FilterRule,
    {
      id: 'rule2',
      filter: '#personal',
      fileName: 'personal-backup',
      isRemainder: false,
    } as FilterRule,
  ],
  filterSyncState: {
    rule1: {
      status: 'synced',
      lastSynced: Date.now(),
      driveFileId: 'file1',
    } as FileSyncState,
    rule2: {
      status: 'pending',
      driveFileId: undefined,
    } as FileSyncState,
  },
  filterMatchCounts: {
    rule1: 5,
    rule2: 3,
  },
  onConnectDrive: vi.fn(),
  onReconnectDrive: vi.fn(),
  onDisconnectDrive: vi.fn(),
  onSyncAllNow: vi.fn(),
  onAddFilterRule: vi.fn(),
  onAddRemainderRule: vi.fn(),
  onUpdateFilterRule: vi.fn(),
  onRemoveFilterRule: vi.fn(),
  onSyncFilterRule: vi.fn(),
  onDownloadFilterRule: vi.fn(),
  onBack: vi.fn(),
  onLoadSharePermissions: vi.fn(),
  onInvitePerson: vi.fn(),
  onChangePersonRole: vi.fn(),
  onRemovePerson: vi.fn(),
  onChangeGeneralAccess: vi.fn(),
  onChangeGeneralRole: vi.fn(),
  ...overrides,
});

describe('SettingsView - Download Button', () => {
  it('renders one download button per backup-file row', () => {
    const props = createMockProps();
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    expect(downloadButtons).toHaveLength(2);
  });

  it('download button appears before the share button in DOM order', () => {
    const props = createMockProps();
    const { container } = render(<SettingsView {...props} />);

    // Get the first backup-file-row
    const rows = container.querySelectorAll('.backup-file-row');
    const firstRow = rows[0];
    const fileStatus = firstRow.querySelector('.file-status');

    // Get the download button wrapper and share button
    const downloadWrapper = fileStatus?.querySelector('.download-button-wrapper');
    const shareButton = fileStatus?.querySelector('.share-button');

    // Check that download appears before share in the DOM
    if (downloadWrapper && shareButton) {
      expect(downloadWrapper.compareDocumentPosition(shareButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('download button is disabled when filterMatchCounts[rule.id] is 0', () => {
    const props = createMockProps({
      filterMatchCounts: { rule1: 0, rule2: 3 },
    });
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    expect(downloadButtons[0]).toBeDisabled();
    expect(downloadButtons[1]).not.toBeDisabled();
  });

  it('download button is disabled when fileName is empty/whitespace', () => {
    const props = createMockProps({
      filterRules: [
        { id: 'rule1', filter: '#project', fileName: '   ', isRemainder: false } as FilterRule,
        { id: 'rule2', filter: '#personal', fileName: 'personal-backup', isRemainder: false } as FilterRule,
      ],
    });
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    expect(downloadButtons[0]).toBeDisabled();
    expect(downloadButtons[1]).not.toBeDisabled();
  });

  it('download button is enabled when filterMatchCounts[rule.id] >= 1 and fileName is set', () => {
    const props = createMockProps({
      filterMatchCounts: { rule1: 1, rule2: 10 },
    });
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    expect(downloadButtons[0]).not.toBeDisabled();
    expect(downloadButtons[1]).not.toBeDisabled();
  });

  it('clicking download button opens dropdown showing both option labels', async () => {
    const props = createMockProps();
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    await userEvent.click(downloadButtons[0]);

    expect(screen.getByText('Download as JSON')).toBeInTheDocument();
    expect(screen.getByText('Download as Markdown')).toBeInTheDocument();
  });

  it('clicking outside (backdrop) closes dropdown', async () => {
    const props = createMockProps();
    const { container } = render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    await userEvent.click(downloadButtons[0]);

    expect(screen.getByText('Download as JSON')).toBeInTheDocument();

    // Click the backdrop
    const backdrop = container.querySelector('.download-menu-backdrop');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(screen.queryByText('Download as JSON')).not.toBeInTheDocument();
  });

  it('clicking "Download as JSON" calls onDownloadFilterRule and closes menu', async () => {
    const onDownloadFilterRule = vi.fn();
    const props = createMockProps({ onDownloadFilterRule });
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    await userEvent.click(downloadButtons[0]);

    const jsonButton = screen.getByText('Download as JSON');
    await userEvent.click(jsonButton);

    expect(onDownloadFilterRule).toHaveBeenCalledWith('rule1', 'json');
    expect(screen.queryByText('Download as Markdown')).not.toBeInTheDocument();
  });

  it('clicking "Download as Markdown" calls onDownloadFilterRule and closes menu', async () => {
    const onDownloadFilterRule = vi.fn();
    const props = createMockProps({ onDownloadFilterRule });
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');
    await userEvent.click(downloadButtons[0]);

    const markdownButton = screen.getByText('Download as Markdown');
    await userEvent.click(markdownButton);

    expect(onDownloadFilterRule).toHaveBeenCalledWith('rule1', 'markdown');
    expect(screen.queryByText('Download as JSON')).not.toBeInTheDocument();
  });

  it('clicking download button again closes dropdown', async () => {
    const props = createMockProps();
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');

    // Open dropdown
    await userEvent.click(downloadButtons[0]);
    expect(screen.getByText('Download as JSON')).toBeInTheDocument();

    // Close dropdown by clicking button again
    await userEvent.click(downloadButtons[0]);
    expect(screen.queryByText('Download as JSON')).not.toBeInTheDocument();
  });

  it('each download button has its own independent dropdown state', async () => {
    const props = createMockProps();
    render(<SettingsView {...props} />);

    const downloadButtons = screen.getAllByLabelText('Download backup file');

    // Open first button's dropdown
    await userEvent.click(downloadButtons[0]);
    expect(screen.getByText('Download as JSON')).toBeInTheDocument();

    // Open second button's dropdown (should close first)
    await userEvent.click(downloadButtons[1]);
    const jsonButtons = screen.queryAllByText('Download as JSON');
    expect(jsonButtons).toHaveLength(1); // Only one dropdown visible at a time
  });
});
