/**
 * Entry filtering logic for the Notes Diary app.
 */

import { Entry } from '../types';
import { ViewMode } from './mode';
import { splitParts, splitParagraphs } from './tags';

export function filterEntries(
  entries: Entry[],
  mode: ViewMode,
  selectedDate: string,
  selectedTags: string[],
  searchQuery: string
): Entry[] {
  let filtered = entries;

  if (mode === 'day') {
    filtered = entries.filter(e => e.date === selectedDate);
  } else if (mode === 'tag') {
    filtered = entries.filter(e => {
      const paragraphs = splitParagraphs(e.text);
      return paragraphs.some(p => {
        const parts = splitParts(p);
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
  const paragraphs = splitParagraphs(entry.text);

  if (mode === 'day') {
    return paragraphs;
  }

  if (mode === 'tag') {
    return paragraphs.filter(p => {
      const parts = splitParts(p);
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
    return paragraphs.filter(p => p.toLowerCase().includes(query));
  }

  return paragraphs;
}
