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
});
