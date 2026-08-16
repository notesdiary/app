import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectPicker } from '../components/ProjectPicker';
import * as dateUtils from '../lib/dateUtils';

// Mock formatDate to return predictable values
vi.mock('../lib/dateUtils', () => ({
  formatDate: vi.fn((iso: string) => {
    // Simple mock: extract date and return formatted version
    const date = new Date(iso);
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getUTCMonth()];
    const day = date.getUTCDate();
    return {
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()],
      md: `${month} ${day}`,
    };
  }),
}));

describe('Drive Discovery Section', () => {
  // Helper function to render ProjectPicker with test props
  const renderProjectPicker = (props = {}) => {
    const defaultProps = {
      projects: [],
      onCreate: vi.fn(),
      onDelete: vi.fn(),
      onOpen: vi.fn(),
      driveDiscoveredFolders: [],
      driveDiscoveryLoading: false,
      ...props,
    };

    return render(<ProjectPicker {...defaultProps} />);
  };

  it('should not render the drive-discovery section when empty and not loading', () => {
    renderProjectPicker({
      driveDiscoveredFolders: [],
      driveDiscoveryLoading: false,
    });

    // Query for the drive discovery section
    const section = screen.queryByText('Also in Google Drive');
    expect(section).not.toBeInTheDocument();

    // Also verify the loading text is not present
    const loadingText = screen.queryByText('Checking Google Drive...');
    expect(loadingText).not.toBeInTheDocument();
  });

  it('should display loading text when driveDiscoveryLoading is true', () => {
    renderProjectPicker({
      driveDiscoveredFolders: [],
      driveDiscoveryLoading: true,
    });

    // Assert that the loading text is visible
    const loadingText = screen.getByText('Checking Google Drive...');
    expect(loadingText).toBeInTheDocument();

    // Assert that the heading is NOT visible yet
    const heading = screen.queryByText('Also in Google Drive');
    expect(heading).not.toBeInTheDocument();
  });

  it('should display correct folder names and last updated dates', () => {
    const discoveredFolders = [
      { name: 'Work Projects', modifiedTime: '2026-08-15T10:00:00Z' },
      { name: 'Personal', modifiedTime: '2026-08-14T15:30:00Z' },
    ];

    renderProjectPicker({
      driveDiscoveredFolders: discoveredFolders,
      driveDiscoveryLoading: false,
    });

    // Assert that the "Also in Google Drive" heading is visible
    const heading = screen.getByText('Also in Google Drive');
    expect(heading).toBeInTheDocument();

    // Assert that both folder names appear
    expect(screen.getByText('Work Projects')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();

    // Assert that last updated dates appear with formatted dates
    expect(screen.getByText('Last updated Aug 15')).toBeInTheDocument();
    expect(screen.getByText('Last updated Aug 14')).toBeInTheDocument();
  });

  it('should render exactly 2 rows with no extra duplicates', () => {
    const discoveredFolders = [
      { name: 'Work Projects', modifiedTime: '2026-08-15T10:00:00Z' },
      { name: 'Personal', modifiedTime: '2026-08-14T15:30:00Z' },
    ];

    const { container } = renderProjectPicker({
      driveDiscoveredFolders: discoveredFolders,
      driveDiscoveryLoading: false,
    });

    // Find all drive-discovery-item elements
    const items = container.querySelectorAll('.drive-discovery-item');
    expect(items).toHaveLength(2);
  });

  it('should not have interactive elements (buttons or onclick) on discovered folder rows', () => {
    const discoveredFolders = [
      { name: 'Work Projects', modifiedTime: '2026-08-15T10:00:00Z' },
      { name: 'Personal', modifiedTime: '2026-08-14T15:30:00Z' },
    ];

    const { container } = renderProjectPicker({
      driveDiscoveredFolders: discoveredFolders,
      driveDiscoveryLoading: false,
    });

    // Get the drive discovery items
    const items = container.querySelectorAll('.drive-discovery-item');

    // Verify no items have onclick or button roles
    items.forEach((item) => {
      // Should not be a button
      expect(item.tagName).not.toBe('BUTTON');

      // Should not have onclick attribute
      expect(item).not.toHaveAttribute('onclick');

      // Should not contain any buttons as children
      const buttons = item.querySelectorAll('button');
      expect(buttons).toHaveLength(0);

      // Should not have any interactive roles
      const role = item.getAttribute('role');
      if (role) {
        expect(role).not.toMatch(/button|link|menuitem/i);
      }
    });
  });
});
