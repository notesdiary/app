/**
 * Entry filtering logic for the Notes Diary app.
 */

import { Entry } from '../types';
import { ViewMode } from './mode';
import { splitParts, splitSections } from './tags';

export function filterEntries(
  entries: Entry[],
  mode: ViewMode,
  selectedTags: string[],
  searchQuery: string
): Entry[] {
  let filtered = entries;

  if (mode === 'all') {
    filtered = entries;
  } else if (mode === 'tag') {
    filtered = entries.filter(e => {
      const sections = splitSections(e.text);
      return sections.some(section => {
        const parts = splitParts(section);
        const tags = parts.filter(pt => pt.isTag).map(pt => pt.text);
        return selectedTags.some(st => {
          if (st === '__untagged__') {
            return tags.length === 0;
          }
          return tags.includes(st);
        });
      });
    });
  } else if (mode === 'search') {
    const query = searchQuery.toLowerCase();
    filtered = entries.filter(e => {
      const text = e.text.toLowerCase();
      return text.includes(query);
    });
  }

  // Sort: date desc, then time desc
  filtered.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.time.localeCompare(a.time);
  });

  return filtered;
}

export function filterParagraphsInEntry(
  entry: Entry,
  mode: ViewMode,
  selectedTags: string[],
  searchQuery: string
): string[] {
  const sections = splitSections(entry.text);

  if (mode === 'all') {
    return sections;
  }

  if (mode === 'tag') {
    return sections.filter(section => {
      const parts = splitParts(section);
      const tags = parts.filter(pt => pt.isTag).map(pt => pt.text);
      return selectedTags.some(st => {
        if (st === '__untagged__') {
          return tags.length === 0;
        }
        return tags.includes(st);
      });
    });
  }

  if (mode === 'search') {
    const query = searchQuery.toLowerCase();
    return sections.filter(section => section.toLowerCase().includes(query));
  }

  return sections;
}
