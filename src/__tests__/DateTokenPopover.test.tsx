import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateTokenPopover from '../components/DateTokenPopover';

describe('DateTokenPopover', () => {
  it('renders input in popover', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();

    const { container } = render(
      <DateTokenPopover
        anchor={{ top: 100, left: 200 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('date');
  });

  it('positions container at anchor.top/left', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();

    const { container } = render(
      <DateTokenPopover
        anchor={{ top: 150, left: 250 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    const popover = container.querySelector('.date-token-popover');
    expect(popover).toHaveStyle('position: absolute');
    expect(popover).toHaveStyle('top: 150px');
    expect(popover).toHaveStyle('left: 250px');
  });

  it('calls onSelect with ISO value when date is selected', async () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <DateTokenPopover
        anchor={{ top: 100, left: 200 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(input, '2026-01-05');

    expect(onSelect).toHaveBeenCalledWith('2026-01-05');
  });

  it('does not call onSelect when value is empty', async () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <DateTokenPopover
        anchor={{ top: 100, left: 200 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;

    // Set a value first
    await user.type(input, '2026-01-05');
    expect(onSelect).toHaveBeenCalledWith('2026-01-05');

    onSelect.mockClear();

    // Clear the input value (simulating native date picker mid-pick)
    await user.clear(input);

    // Verify onSelect was NOT called for empty value
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onDismiss on Escape key', async () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <DateTokenPopover
        anchor={{ top: 100, left: 200 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    input.focus();
    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalled();
  });

  it('input has autoFocus', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();

    const { container } = render(
      <DateTokenPopover
        anchor={{ top: 100, left: 200 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toHaveFocus();
  });

  it('exposes containerRef', () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    const ref = { current: null };

    render(
      <DateTokenPopover
        ref={ref}
        anchor={{ top: 100, left: 200 }}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.classList.contains('date-token-popover')).toBe(true);
  });
});
