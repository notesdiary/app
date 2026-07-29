/**
 * View mode derivation logic for the Notes Diary app.
 */

export type ViewMode = 'day' | 'tag' | 'search';

/**
 * Derive the current view mode based on active filters.
 * Precedence: search > tag > day
 */
export function deriveMode(searchQuery: string, selectedTags: string[]): ViewMode {
  if (searchQuery.trim().length > 0) {
    return 'search';
  }
  if (selectedTags.length > 0) {
    return 'tag';
  }
  return 'day';
}
