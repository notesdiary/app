import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LeftRail } from '../components/LeftRail';
import { Entry } from '../types';

describe('LeftRail', () => {
  // Helper to create a mock entry
  const createMockEntry = (id: string, text: string): Entry => ({
    id,
    date: '2026-08-15',
    time: '10:00',
    text,
    createdAt: Date.now(),
  });

  it('counts tags per section, not per entry', () => {
    // Test case: entry A has a plain section followed by a tag-only section
    // Entry B has tags mixed into prose
    const entryA = createMockEntry('a', 'note\n\n#work #urgent');
    const entryB = createMockEntry('b', '#work in prose');

    render(
      <LeftRail
        entries={[entryA, entryB]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    // #work should appear in 2 sections: one in entry B's prose, one in entry A's tag-only section
    const workCountElement = screen.getByText('#work').parentElement?.querySelector('.tag-count');
    expect(workCountElement).toBeInTheDocument();
    expect(workCountElement?.textContent).toBe('2');

    // #urgent should appear in 1 section: entry A's tag-only section
    const urgentCountElement = screen.getByText('#urgent').parentElement?.querySelector('.tag-count');
    expect(urgentCountElement).toBeInTheDocument();
    expect(urgentCountElement?.textContent).toBe('1');

    // Untagged should appear in 1 section: entry A's 'note' section
    const untaggedNameElement = screen.getByText('Untagged');
    const untaggedCountElement = untaggedNameElement.parentElement?.querySelector('.tag-count');
    expect(untaggedCountElement).toBeInTheDocument();
    expect(untaggedCountElement?.textContent).toBe('1');
  });

  it('renders Untagged when there are untagged sections', () => {
    const entry = createMockEntry('a', 'plain text without tags');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    expect(screen.getByText('Untagged')).toBeInTheDocument();
  });

  it('does not render Untagged when all sections have tags', () => {
    const entry = createMockEntry('a', '#work #personal');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    expect(screen.queryByText('Untagged')).not.toBeInTheDocument();
  });

  it('sorts tags by count descending, then alphabetically', () => {
    const entryA = createMockEntry('a', '#zebra #apple #apple');
    const entryB = createMockEntry('b', '#apple');

    const { container } = render(
      <LeftRail
        entries={[entryA, entryB]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    const tagItems = container.querySelectorAll('.tag-item .tag-name');
    const tagNames = Array.from(tagItems).map(el => el.textContent);

    // #apple should appear first (count 3), then #zebra (count 1)
    expect(tagNames[0]).toBe('#apple');
    expect(tagNames[1]).toBe('#zebra');
  });

  it('renders no tags message when no entries', () => {
    render(
      <LeftRail
        entries={[]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    expect(screen.getByText('No tags found')).toBeInTheDocument();
  });

  it('counts multiple tags in the same section independently', () => {
    const entry = createMockEntry('a', '#work #urgent #personal');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    // Each tag should have a count of 1 (one section)
    const workCountElement = screen.getByText('#work').parentElement?.querySelector('.tag-count');
    expect(workCountElement?.textContent).toBe('1');

    const urgentCountElement = screen.getByText('#urgent').parentElement?.querySelector('.tag-count');
    expect(urgentCountElement?.textContent).toBe('1');

    const personalCountElement = screen.getByText('#personal').parentElement?.querySelector('.tag-count');
    expect(personalCountElement?.textContent).toBe('1');
  });

  it('handles entries with multiple sections correctly', () => {
    // Entry with 3 sections: plain, tagged, tagged
    const entry = createMockEntry('a', 'plain\n\n#work\n\n#personal');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    // #work count should be 1
    const workCountElement = screen.getByText('#work').parentElement?.querySelector('.tag-count');
    expect(workCountElement?.textContent).toBe('1');

    // #personal count should be 1
    const personalCountElement = screen.getByText('#personal').parentElement?.querySelector('.tag-count');
    expect(personalCountElement?.textContent).toBe('1');

    // Untagged count should be 1 (the 'plain' section)
    const untaggedNameElement = screen.getByText('Untagged');
    const untaggedCountElement = untaggedNameElement.parentElement?.querySelector('.tag-count');
    expect(untaggedCountElement?.textContent).toBe('1');
  });

  // Date browsing tests

  it('counts dates per section correctly', () => {
    const entryA = createMockEntry('a', 'note @2026-01-05');
    const entryB = createMockEntry('b', 'other @2026-01-05');
    const entryC = createMockEntry('c', 'later @2026-02-01');

    render(
      <LeftRail
        entries={[entryA, entryB, entryC]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    // 2026-01-05 should have count 2
    const dateItems = screen.getAllByText(/Jan \d+, 2026|Feb \d+, 2026/);
    const jan05Item = dateItems.find(el => el.textContent === 'Jan 5, 2026');
    expect(jan05Item).toBeInTheDocument();
    const jan05Count = jan05Item?.parentElement?.querySelector('.date-count');
    expect(jan05Count?.textContent).toBe('2');

    // 2026-02-01 should have count 1
    const feb01Item = dateItems.find(el => el.textContent === 'Feb 1, 2026');
    expect(feb01Item).toBeInTheDocument();
    const feb01Count = feb01Item?.parentElement?.querySelector('.date-count');
    expect(feb01Count?.textContent).toBe('1');
  });

  it('renders "Browse by date" section AFTER "Browse by tag" section', () => {
    const entry = createMockEntry('a', '#work\n\nlater @2026-02-01');

    const { container } = render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    const tagSection = container.querySelector('.browse-by-tag-section');
    const dateSection = container.querySelector('.browse-by-date-section');

    expect(tagSection).toBeInTheDocument();
    expect(dateSection).toBeInTheDocument();

    // Tag section should come before date section in DOM by comparing their position
    const railDiv = container.querySelector('.left-rail')!;
    const allChildren = Array.from(railDiv.children);
    const tagSectionIndex = allChildren.indexOf(tagSection!);
    const dateSectionIndex = allChildren.indexOf(dateSection!);
    expect(tagSectionIndex).toBeLessThan(dateSectionIndex);
  });

  it('handles entries with no dated sections without crashing', () => {
    const entry = createMockEntry('a', 'no dates here #tag');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    // Should render "No dates found" message
    expect(screen.getByText('No dates found')).toBeInTheDocument();
  });

  it('renders date items with correct count and calls onDateClick', () => {
    const onDateClick = vi.fn();
    const entry = createMockEntry('a', 'note @2026-01-05\n\nmore @2026-01-05');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={onDateClick}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    const dateButton = screen.getByText('Jan 5, 2026').closest('button');
    expect(dateButton).toBeInTheDocument();
    expect(dateButton?.querySelector('.date-count')?.textContent).toBe('2');

    // Click the date button
    dateButton?.click();
    expect(onDateClick).toHaveBeenCalledWith('2026-01-05');
  });

  it('applies selected class when selectedDate matches', () => {
    const entry = createMockEntry('a', 'note @2026-01-05');

    const { container } = render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate="2026-01-05"
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    const dateButton = screen.getByText('Jan 5, 2026').closest('button');
    expect(dateButton).toHaveClass('selected');
  });

  it('does not apply selected class when selectedDate does not match', () => {
    const entry = createMockEntry('a', 'note @2026-01-05');

    render(
      <LeftRail
        entries={[entry]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate="2026-02-01"
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    const dateButton = screen.getByText('Jan 5, 2026').closest('button');
    expect(dateButton).not.toHaveClass('selected');
  });

  it('dates sort in descending order (ISO lexicographic)', () => {
    const entryA = createMockEntry('a', 'note @2026-01-05');
    const entryB = createMockEntry('b', 'other @2026-02-01');
    const entryC = createMockEntry('c', 'later @2026-03-15');

    const { container } = render(
      <LeftRail
        entries={[entryA, entryB, entryC]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    const dateItems = container.querySelectorAll('.date-item .date-name');
    const dates = Array.from(dateItems).map(el => el.textContent);

    // Should be in descending order: Mar 15, 2026 > Feb 1, 2026 > Jan 5, 2026
    expect(dates[0]).toBe('Mar 15, 2026');
    expect(dates[1]).toBe('Feb 1, 2026');
    expect(dates[2]).toBe('Jan 5, 2026');
  });

  it('tag counts are unaffected by date rendering (regression)', () => {
    const entryA = createMockEntry('a', 'note @2026-01-05 #work');
    const entryB = createMockEntry('b', '#work other @2026-01-05');

    render(
      <LeftRail
        entries={[entryA, entryB]}
        selectedTags={[]}
        onTagClick={vi.fn()}
        selectedDate={null}
        onDateClick={vi.fn()}
        archivedCount={0}
        onSettingsClick={vi.fn()}
        onArchiveClick={vi.fn()}
        onAboutClick={vi.fn()}
        onSwitchProjectClick={vi.fn()}
        isMobile={false}
        isOpen={true}
      />
    );

    // #work should still have count 2 (from 2 sections)
    const workCountElement = screen.getByText('#work').parentElement?.querySelector('.tag-count');
    expect(workCountElement?.textContent).toBe('2');
  });
});
