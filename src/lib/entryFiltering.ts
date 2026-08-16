/**
 * Entry filtering logic for the Notes Diary app.
 */

import { Entry } from '../types';
import { ViewMode } from './mode';
import { splitParts, splitSections, getEntryLevelTags, parseSectionDate } from './tags';

export function filterEntries(
  entries: Entry[],
  mode: ViewMode,
  selectedTags: string[],
  searchQuery: string,
  selectedDate: string | null = null
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
        const tagOk = selectedTags.length === 0 ? true : selectedTags.some(st => {
          if (st === '__untagged__') {
            return tags.length === 0;
          }
          return tags.includes(st);
        });
        if (!tagOk) {
          return false;
        }
        if (selectedDate === null) {
          return true;
        }
        const sectionDate = parseSectionDate(section);
        return sectionDate === selectedDate;
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
  searchQuery: string,
  selectedDate: string | null = null
): string[] {
  const sections = splitSections(entry.text);

  if (mode === 'all') {
    return sections;
  }

  if (mode === 'tag') {
    const entryLevelTags = getEntryLevelTags(entry.text);
    const tagOk = selectedTags.length === 0 ? true : selectedTags.some(st => entryLevelTags.includes(st));
    if (tagOk) {
      // If date filter is active, still need to filter by date
      if (selectedDate !== null) {
        return sections.filter(section => {
          const sectionDate = parseSectionDate(section);
          return sectionDate === selectedDate;
        });
      }
      return sections;
    }
    return sections.filter(section => {
      const parts = splitParts(section);
      const tags = parts.filter(pt => pt.isTag).map(pt => pt.text);
      const sectionTagOk = selectedTags.length === 0 ? true : selectedTags.some(st => {
        if (st === '__untagged__') {
          return tags.length === 0;
        }
        return tags.includes(st);
      });
      if (!sectionTagOk) {
        return false;
      }
      if (selectedDate === null) {
        return true;
      }
      const sectionDate = parseSectionDate(section);
      return sectionDate === selectedDate;
    });
  }

  if (mode === 'search') {
    const query = searchQuery.toLowerCase();
    return sections.filter(section => section.toLowerCase().includes(query));
  }

  return sections;
}
