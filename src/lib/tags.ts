/**
 * Tag parsing utilities for the Notes Diary app.
 */

export interface Part {
  text: string;
  isTag: boolean;
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
 * Split text into paragraphs (split by newline).
 * Returns trimmed, non-empty paragraphs. If all empty, returns [''].
 */
export function splitParagraphs(text: string): string[] {
  const paragraphs = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
  return paragraphs.length > 0 ? paragraphs : [''];
}

/**
 * Extract all tags from a text.
 */
export function extractTags(text: string): string[] {
  const parts = splitParts(text);
  return parts.filter(p => p.isTag).map(p => p.text);
}
