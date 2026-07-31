import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ShareModal,
  type ShareModalProps,
  type ShareFileState,
  type SharePerson,
} from './ShareModal';

function makePerson(overrides: Partial<SharePerson> = {}): SharePerson {
  return {
    permissionId: 'perm-1',
    email: 'alice@example.com',
    role: 'viewer',
    ...overrides,
  };
}

function makeState(overrides: Partial<ShareFileState> = {}): ShareFileState {
  return {
    isLoading: false,
    generalAccess: 'restricted',
    generalRole: 'viewer',
    people: [],
    ...overrides,
  };
}

function makeProps(overrides: Partial<ShareModalProps> = {}): ShareModalProps {
  return {
    fileId: 'file-1',
    fileName: 'My Notes.json',
    token: 'token-1',
    state: makeState(),
    onLoad: vi.fn().mockResolvedValue(undefined),
    onInvite: vi.fn().mockResolvedValue(undefined),
    onRoleChange: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onGeneralAccessChange: vi.fn().mockResolvedValue(undefined),
    onGeneralRoleChange: vi.fn().mockResolvedValue(undefined),
    onCopyLink: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('ShareModal', () => {
  describe('loading -> people list', () => {
    it('shows a loading indicator while isLoading, then the people list once loaded', () => {
      const props = makeProps({ state: makeState({ isLoading: true, people: [] }) });
      const { rerender } = render(<ShareModal {...props} />);

      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();

      const loadedProps = {
        ...props,
        state: makeState({
          isLoading: false,
          people: [makePerson({ email: 'alice@example.com' }), makePerson({ permissionId: 'perm-2', email: 'bob@example.com' })],
        }),
      };
      rerender(<ShareModal {...loadedProps} />);

      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });
  });

  describe('invite', () => {
    it('calls onInvite with the typed email and clears the input on success', async () => {
      const user = userEvent.setup();
      const onInvite = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({ onInvite });
      render(<ShareModal {...props} />);

      const input = screen.getByPlaceholderText('Add people by email') as HTMLInputElement;
      await user.type(input, 'newperson@example.com');
      const inviteButton = screen.getByRole('button', { name: 'Invite' });
      await user.click(inviteButton);

      expect(onInvite).toHaveBeenCalledTimes(1);
      expect(onInvite).toHaveBeenCalledWith('newperson@example.com');

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });

    it('shows an inline error and keeps the typed value when onInvite rejects', async () => {
      const user = userEvent.setup();
      const onInvite = vi.fn().mockRejectedValue(new Error('Could not invite that person'));
      const props = makeProps({ onInvite });
      render(<ShareModal {...props} />);

      const input = screen.getByPlaceholderText('Add people by email') as HTMLInputElement;
      await user.type(input, 'newperson@example.com');
      const inviteButton = screen.getByRole('button', { name: 'Invite' });
      await user.click(inviteButton);

      await waitFor(() => {
        expect(screen.getByText('Could not invite that person')).toBeInTheDocument();
      });
      expect(input.value).toBe('newperson@example.com');
    });
  });

  describe('role change', () => {
    it('calls onRoleChange with the permissionId and the new role in UI vocabulary', async () => {
      const user = userEvent.setup();
      const onRoleChange = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        onRoleChange,
        state: makeState({
          people: [makePerson({ permissionId: 'perm-42', email: 'carol@example.com', role: 'viewer' })],
        }),
      });
      render(<ShareModal {...props} />);

      const select = screen.getByDisplayValue('Viewer');
      await user.selectOptions(select, 'editor');

      expect(onRoleChange).toHaveBeenCalledTimes(1);
      expect(onRoleChange).toHaveBeenCalledWith('perm-42', 'editor');
    });
  });

  describe('remove', () => {
    it('calls onRemove with the permissionId of that person', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        onRemove,
        state: makeState({
          people: [makePerson({ permissionId: 'perm-99', email: 'dave@example.com', role: 'commenter' })],
        }),
      });
      render(<ShareModal {...props} />);

      const removeButton = screen.getByRole('button', { name: 'Remove dave@example.com' });
      await user.click(removeButton);

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith('perm-99');
    });
  });

  describe('general access toggle', () => {
    it('renders only one select when restricted, and calls onGeneralAccessChange when switched to anyone', async () => {
      const user = userEvent.setup();
      const onGeneralAccessChange = vi.fn().mockResolvedValue(undefined);
      const props = makeProps({
        onGeneralAccessChange,
        state: makeState({ generalAccess: 'restricted' }),
      });
      render(<ShareModal {...props} />);

      const selects = document.querySelectorAll('select');
      expect(selects.length).toBe(1);

      const accessSelect = screen.getByDisplayValue('Restricted');
      await user.selectOptions(accessSelect, 'anyone');

      expect(onGeneralAccessChange).toHaveBeenCalledTimes(1);
      expect(onGeneralAccessChange).toHaveBeenCalledWith('anyone');
    });

    it('renders both the access select and the general role select when access is anyone', () => {
      const props = makeProps({
        state: makeState({ generalAccess: 'anyone', generalRole: 'viewer' }),
      });
      render(<ShareModal {...props} />);

      const selects = document.querySelectorAll('select');
      expect(selects.length).toBe(2);
      expect(screen.getByDisplayValue('Anyone with the link')).toBeInTheDocument();
    });
  });

  describe('copy link', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows "Link copied" after clicking, then reverts to "Copy link" after 1500ms', () => {
      const onCopyLink = vi.fn();
      const props = makeProps({ onCopyLink });
      render(<ShareModal {...props} />);

      const copyButton = screen.getByRole('button', { name: /Copy link/i });
      fireEvent.click(copyButton);

      expect(onCopyLink).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /Link copied/i })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      expect(screen.getByRole('button', { name: /^Copy link$/i })).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('calls onClose when the close (x) button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const props = makeProps({ onClose });
      render(<ShareModal {...props} />);

      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the overlay is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const props = makeProps({ onClose });
      const { container } = render(<ShareModal {...props} />);

      const overlay = container.querySelector('.share-modal-overlay') as HTMLElement;
      await user.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside the panel', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const props = makeProps({ onClose });
      const { container } = render(<ShareModal {...props} />);

      const panel = container.querySelector('.share-modal-panel') as HTMLElement;
      await user.click(panel);

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
