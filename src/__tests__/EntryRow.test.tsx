import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryRow } from '../components/EntryRow';
import { Entry } from '../types';

describe('EntryRow', () => {
  const mockEntry: Entry = {
    id: 'test-1',
    date: '2026-01-20',
    time: '14:30',
    text: 'Meeting scheduled @2026-01-05',
  };

  const defaultProps = {
    entry: mockEntry,
    mode: 'day' as const,
    selectedTags: [] as string[],
    selectedDate: null as string | null,
    searchQuery: '',
    isEditing: false,
    editText: '',
    onEditTextChange: vi.fn(),
    onEditSave: vi.fn(),
    onTagClick: vi.fn(),
    onDateClick: vi.fn(),
    onRemove: vi.fn(),
    onClickToEdit: vi.fn(),
  };

  describe('Read mode', () => {
    it('renders non-editing EntryRow with dated section', () => {
      const { container } = render(<EntryRow {...defaultProps} />);
      const datePill = container.querySelector('.date-pill');
      expect(datePill).toBeInTheDocument();
      expect(datePill?.textContent).toBe('Jan 5, 2026');
    });

    it('calls onDateClick when clicking date pill in read mode', async () => {
      const onDateClick = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={false}
          onDateClick={onDateClick}
        />
      );
      const datePill = container.querySelector('.date-pill') as HTMLElement;
      expect(datePill).toBeInTheDocument();
      await userEvent.click(datePill);
      expect(onDateClick).toHaveBeenCalledWith('2026-01-05', expect.any(Object));
    });
  });

  describe('Edit mode', () => {
    it('opens popover when typing @ followed by digit', () => {
      const onEditTextChange = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@1"
          onEditTextChange={onEditTextChange}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      // Directly set selectionStart property before change event
      textarea.selectionStart = 2; // Position after @1
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@1' } });

      // Check if popover is in DOM
      const popover = container.querySelector('.date-token-popover');
      expect(popover).toBeInTheDocument();

      // Check if date input is in popover
      const dateInput = popover?.querySelector('input[type="date"]') as HTMLInputElement;
      expect(dateInput).toBeInTheDocument();
    });

    it('does NOT open popover when typing @ followed by letter', () => {
      const onEditTextChange = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@a"
          onEditTextChange={onEditTextChange}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 2; // Position after @a
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@a' } });

      // Popover should NOT be in DOM
      const popover = container.querySelector('.date-token-popover');
      expect(popover).not.toBeInTheDocument();
    });

    it('splices date into textarea at correct position on date selection', () => {
      let currentText = 'note @2';
      const onEditTextChange = vi.fn((text: string) => {
        currentText = text;
      });

      const { rerender, container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText={currentText}
          onEditTextChange={onEditTextChange}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 7; // Position after @2
      textarea.selectionEnd = 7;
      fireEvent.change(textarea, { target: { value: 'note @2' } });

      // Popover should be open
      let popover = container.querySelector('.date-token-popover');
      expect(popover).toBeInTheDocument();

      // Get the date input and set value to trigger onSelect
      const dateInput = popover?.querySelector('input[type="date"]') as HTMLInputElement;
      expect(dateInput).toBeInTheDocument();

      // Simulate selecting a date
      fireEvent.change(dateInput, { target: { value: '2026-01-05' } });

      // Check that onEditTextChange was called with spliced text
      const calls = onEditTextChange.mock.calls;
      const splicedCall = calls.find((call) => call[0].includes('2026-01-05'));
      expect(splicedCall?.[0]).toBe('note @2026-01-05');

      // Simulate parent component updating with new text
      currentText = 'note @2026-01-05';
      rerender(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText={currentText}
          onEditTextChange={onEditTextChange}
        />
      );

      // Popover should be closed after selection
      popover = container.querySelector('.date-token-popover');
      expect(popover).not.toBeInTheDocument();
    });

    it('closes popover on Escape key', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@1"
          onEditTextChange={vi.fn()}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 2; // Position after @1
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@1' } });

      // Popover should be open
      let popover = container.querySelector('.date-token-popover');
      expect(popover).toBeInTheDocument();

      // Get date input and press Escape
      const dateInput = popover?.querySelector('input[type="date"]') as HTMLInputElement;
      dateInput.focus();
      await user.keyboard('{Escape}');

      // Popover should be closed
      popover = container.querySelector('.date-token-popover');
      expect(popover).not.toBeInTheDocument();
    });
  });

  describe('Blur guard', () => {
    it('does NOT call onEditSave when blur moves to popover date input', () => {
      const onEditSave = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@1"
          onEditTextChange={vi.fn()}
          onEditSave={onEditSave}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 2;
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@1' } });

      // Get popover date input
      const popover = container.querySelector('.date-token-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      const dateInput = popover.querySelector('input[type="date"]') as HTMLInputElement;

      // Simulate blur with relatedTarget pointing to date input
      fireEvent.blur(textarea, { relatedTarget: dateInput });

      expect(onEditSave).not.toHaveBeenCalled();
    });

    it('does NOT call onEditSave when blur has null relatedTarget (while popover open)', () => {
      const onEditSave = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@1"
          onEditTextChange={vi.fn()}
          onEditSave={onEditSave}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 2;
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@1' } });

      // Popover should be open
      const popover = container.querySelector('.date-token-popover');
      expect(popover).toBeInTheDocument();

      // Simulate blur with null relatedTarget (focus lost)
      fireEvent.blur(textarea, { relatedTarget: null });

      expect(onEditSave).not.toHaveBeenCalled();
    });

    it('DOES call onEditSave when blur moves outside popover', () => {
      const onEditSave = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@1"
          onEditTextChange={vi.fn()}
          onEditSave={onEditSave}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 2;
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@1' } });

      // Create an external element to blur to
      const externalBtn = document.createElement('button');
      document.body.appendChild(externalBtn);

      try {
        // Simulate blur with relatedTarget pointing outside popover
        fireEvent.blur(textarea, { relatedTarget: externalBtn });

        expect(onEditSave).toHaveBeenCalled();
      } finally {
        document.body.removeChild(externalBtn);
      }
    });

    it('calls onEditSave normally when popover is closed', () => {
      const onEditSave = vi.fn();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="just some text"
          onEditTextChange={vi.fn()}
          onEditSave={onEditSave}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 14;
      textarea.selectionEnd = 14;
      fireEvent.change(textarea, { target: { value: 'just some text' } });

      // Popover should NOT be open
      const popover = container.querySelector('.date-token-popover');
      expect(popover).not.toBeInTheDocument();

      // Simulate blur
      const externalBtn = document.createElement('button');
      document.body.appendChild(externalBtn);

      try {
        fireEvent.blur(textarea, { relatedTarget: externalBtn });
        expect(onEditSave).toHaveBeenCalled();
      } finally {
        document.body.removeChild(externalBtn);
      }
    });
  });

  describe('Popover dismissal', () => {
    it('closes popover and refocuses textarea on onDismiss', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <EntryRow
          {...defaultProps}
          isEditing={true}
          editText="@1"
          onEditTextChange={vi.fn()}
        />
      );

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      textarea.selectionStart = 2;
      textarea.selectionEnd = 2;
      fireEvent.change(textarea, { target: { value: '@1' } });

      // Popover should be open
      let popover = container.querySelector('.date-token-popover');
      expect(popover).toBeInTheDocument();

      // Get date input and press Escape to trigger onDismiss
      const dateInput = popover?.querySelector('input[type="date"]') as HTMLInputElement;
      dateInput.focus();
      await user.keyboard('{Escape}');

      // Popover should be closed
      popover = container.querySelector('.date-token-popover');
      expect(popover).not.toBeInTheDocument();

      // Textarea should be focused
      expect(textarea).toHaveFocus();
    });
  });
});
