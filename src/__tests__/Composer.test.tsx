import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '../components/Composer';

describe('Composer', () => {
  const defaultProps = {
    text: '',
    onTextChange: vi.fn(),
    onBlur: vi.fn(),
  };

  describe('Date popover opening', () => {
    it('opens popover when typing @ followed by digit', () => {
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@1"
          onTextChange={vi.fn()}
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
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@a"
          onTextChange={vi.fn()}
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
  });

  describe('Date selection and splicing', () => {
    it('splices date into composer text at correct position on date selection', () => {
      let currentText = 'note @2';
      const onTextChange = vi.fn((text: string) => {
        currentText = text;
      });

      const { rerender, container } = render(
        <Composer
          {...defaultProps}
          text={currentText}
          onTextChange={onTextChange}
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

      // Check that onTextChange was called with spliced text
      const calls = onTextChange.mock.calls;
      const splicedCall = calls.find((call) => call[0].includes('2026-01-05'));
      expect(splicedCall?.[0]).toBe('note @2026-01-05');

      // Simulate parent component updating with new text
      currentText = 'note @2026-01-05';
      rerender(
        <Composer
          {...defaultProps}
          text={currentText}
          onTextChange={onTextChange}
        />
      );

      // Popover should be closed after selection
      popover = container.querySelector('.date-token-popover');
      expect(popover).not.toBeInTheDocument();
    });
  });

  describe('Blur guard', () => {
    it('does NOT call onBlur when blur moves to popover date input', () => {
      const onBlur = vi.fn();
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@1"
          onTextChange={vi.fn()}
          onBlur={onBlur}
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

      expect(onBlur).not.toHaveBeenCalled();
    });

    it('does NOT call onBlur when blur has null relatedTarget (while popover open)', () => {
      const onBlur = vi.fn();
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@1"
          onTextChange={vi.fn()}
          onBlur={onBlur}
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

      expect(onBlur).not.toHaveBeenCalled();
    });

    it('DOES call onBlur when blur moves outside popover', () => {
      const onBlur = vi.fn();
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@1"
          onTextChange={vi.fn()}
          onBlur={onBlur}
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

        expect(onBlur).toHaveBeenCalled();
      } finally {
        document.body.removeChild(externalBtn);
      }
    });

    it('calls onBlur normally when popover is closed', () => {
      const onBlur = vi.fn();
      const { container } = render(
        <Composer
          {...defaultProps}
          text="just some text"
          onTextChange={vi.fn()}
          onBlur={onBlur}
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
        expect(onBlur).toHaveBeenCalled();
      } finally {
        document.body.removeChild(externalBtn);
      }
    });
  });

  describe('Popover dismissal', () => {
    it('closes popover on Escape key', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@1"
          onTextChange={vi.fn()}
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

    it('closes popover and refocuses textarea on onDismiss', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Composer
          {...defaultProps}
          text="@1"
          onTextChange={vi.fn()}
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
