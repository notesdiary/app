/**
 * Tag parsing utilities for the Notes Diary app.
 */

export interface Part {
  text: string;
  isTag: boolean;
  isDate?: boolean;
  date?: string;
}

/**
 * Regex to match date tokens in the format @YYYY-MM-DD at word boundaries.
 * Requires whitespace or start-of-string before the @, and not followed by a digit.
 */
export const SECTION_DATE_TOKEN_RE = /(?<=^|\s)@(\d{4})-(\d{2})-(\d{2})(?!\d)/g;

export interface DateToken {
  index: number;
  raw: string;
  iso: string;
}

/**
 * Check if a calendar date (year, month, day) is valid using Date.UTC roundtrip.
 * Month is 1-indexed (1-12), day is 1-indexed (1-31).
 */
export function isValidCalendarDate(y: number, m: number, d: number): boolean {
  // Month must be 1-12
  if (m < 1 || m > 12) {
    return false;
  }

  // Create a date with UTC and check if it roundtrips correctly
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Find the first accepted (valid calendar) date token in a section.
 * Returns {index, raw, iso} for the first valid match, or null if none found.
 */
export function findAcceptedDateToken(section: string): DateToken | null {
  const regex = new RegExp(SECTION_DATE_TOKEN_RE.source, 'g');
  let match;
  while ((match = regex.exec(section)) !== null) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (isValidCalendarDate(year, month, day)) {
      return {
        index: match.index,
        raw: match[0],
        iso: `${match[1]}-${match[2]}-${match[3]}`,
      };
    }
  }
  return null;
}

/**
 * Parse a section to extract the first valid date token.
 * Returns the ISO date string (YYYY-MM-DD) or null if no valid date found.
 */
export function parseSectionDate(section: string): string | null {
  const token = findAcceptedDateToken(section);
  return token ? token.iso : null;
}

/**
 * Split text into parts: plain text and tags.
 * Tags must start with # followed by a letter, then word characters or hyphens.
 */
export function splitParts(text: string): Part[] {
  const regex = /#[a-zA-Z][\w-]*/g;
  const parts: Part[] = [];
  let lastIndex = 0;

  let match;
  while ((match = regex.exec(text)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, match.index),
        isTag: false,
      });
    }

    // Add the tag
    parts.push({
      text: match[0],
      isTag: true,
    });

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      isTag: false,
    });
  }

  // If no parts were found, return the entire text as non-tag
  if (parts.length === 0) {
    return [{ text, isTag: false }];
  }

  return parts;
}

/**
 * Split text into sections. A section is one or more consecutive non-blank
 * lines; a run of one or more blank lines separates sections. Internal line
 * breaks within a section are preserved. Leading/trailing blank lines are
 * trimmed and do not produce empty sections.
 */
export function splitSections(text: string): string[] {
  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        sections.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  return sections;
}

/**
 * Extract all tags from a text.
 */
export function extractTags(text: string): string[] {
  const parts = splitParts(text);
  return parts.filter(p => p.isTag).map(p => p.text);
}

/**
 * Check if a section contains only tags and whitespace (no other text content).
 */
export function isTagOnlySection(section: string): boolean {
  const parts = splitParts(section);
  return parts.every(part => {
    if (part.isTag) {
      return true;
    }
    // Non-tag part is tag-only if it's whitespace only
    return part.text.trim() === '';
  });
}

/**
 * Extract tags from the last section of text, if that section is tag-only.
 * Returns empty array if there are no sections, if the last section has non-tag content,
 * or if the text contains no tags in the last section.
 */
export function getEntryLevelTags(text: string): string[] {
  const sections = splitSections(text);
  if (sections.length === 0) {
    return [];
  }
  const last = sections[sections.length - 1];
  if (!isTagOnlySection(last)) {
    return [];
  }
  return extractTags(last);
}

/**
 * State object to track whether a date has already been emitted in splitPartsWithDate.
 * Shared across multiple calls to ensure a date is only marked once.
 */
export interface AlreadyEmitted {
  done: boolean;
}

/**
 * Split text into parts: plain text, tags, and optionally a date.
 * Takes explicit acceptedIso (NOT re-derived from text).
 * Collects tag matches + one date match (if acceptedIso matches a token in text).
 * If acceptedIso === null, never marks a date part.
 * If a date match occurs and equals acceptedIso and alreadyEmitted.done === false,
 * flag it isDate:true, set alreadyEmitted.done = true, later occurrences stay inert.
 * Emitted-flag is shared across calls with same acceptedIso → date part only on FIRST call.
 */
export function splitPartsWithDate(
  text: string,
  acceptedIso: string | null,
  alreadyEmitted?: AlreadyEmitted
): Part[] {
  const tagRegex = /#[a-zA-Z][\w-]*/g;
  const positions: Array<{
    index: number;
    length: number;
    type: 'tag' | 'date';
    part: Part;
  }> = [];

  // Find all tags
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    positions.push({
      index: match.index,
      length: match[0].length,
      type: 'tag',
      part: { text: match[0], isTag: true },
    });
  }

  // Find all date tokens if acceptedIso is provided
  if (acceptedIso !== null) {
    const state = alreadyEmitted || { done: false };
    const dateRegex = new RegExp(SECTION_DATE_TOKEN_RE.source, 'g');
    while ((match = dateRegex.exec(text)) !== null) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);

      if (isValidCalendarDate(year, month, day)) {
        const iso = `${match[1]}-${match[2]}-${match[3]}`;
        const shouldMark = iso === acceptedIso && !state.done;
        if (shouldMark) {
          state.done = true;
        }

        const part: Part = {
          text: match[0],
          isTag: false,
        };
        if (shouldMark) {
          part.isDate = true;
          part.date = iso;
        }

        positions.push({
          index: match.index,
          length: match[0].length,
          type: 'date',
          part,
        });
      }
    }
  }

  // Sort by index
  positions.sort((a, b) => a.index - b.index);

  // Build parts array
  const parts: Part[] = [];
  let lastIndex = 0;

  for (const pos of positions) {
    // Add text before this token
    if (pos.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, pos.index),
        isTag: false,
      });
    }

    // Add the token
    parts.push(pos.part);
    lastIndex = pos.index + pos.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      isTag: false,
    });
  }

  // If no parts were found, return the entire text as non-tag
  if (parts.length === 0) {
    return [{ text, isTag: false }];
  }

  return parts;
}
