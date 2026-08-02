import { Entry } from '../types';
import { splitParts, splitSections } from '../lib/tags';
import { AppIcon } from './AppIcon';
import './LeftRail.css';

interface LeftRailProps {
  entries: Entry[];
  selectedTags: string[];
  onTagClick: (tag: string) => void;
  archivedCount: number;
  onSettingsClick: () => void;
  onArchiveClick: () => void;
  onAboutClick: () => void;
  isMobile: boolean;
  isOpen: boolean;
}

export function LeftRail(props: LeftRailProps) {
  // Scan all entries for tags
  const tagCounts: Record<string, number> = {};
  let untaggedCount = 0;

  props.entries.forEach(entry => {
    const sections = splitSections(entry.text);
    sections.forEach(section => {
      const parts = splitParts(section);
      const tags = parts.filter(pt => pt.isTag).map(pt => pt.text);

      if (tags.length === 0) {
        untaggedCount++;
      } else {
        tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
  });

  // Sort by count desc, then alphabetically
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([tag, count]) => ({ tag, count }));

  // Include untagged if it has entries
  const allTags = untaggedCount > 0 ? [{ tag: '__untagged__', count: untaggedCount }, ...sortedTags] : sortedTags;

  return (
    <div className={`left-rail ${props.isMobile ? 'mobile' : 'desktop'} ${props.isOpen ? 'open' : 'closed'}`}>
      <div className="left-rail-header">
        <AppIcon size={30} />
        <div className="app-title">Notes Diary</div>
      </div>

      <div className="browse-by-tag-section">
        <div className="section-header">Browse by tag</div>

        <div className="tag-browser">
          {allTags.length === 0 ? (
            <div className="no-tags">No tags found</div>
          ) : (
            allTags.map(({ tag, count }) => {
              const isSelected = props.selectedTags.includes(tag);
              const isUntagged = tag === '__untagged__';

              return (
                <button
                  key={tag}
                  className={`tag-item ${isSelected ? 'selected' : ''} ${isUntagged ? 'untagged' : ''}`}
                  onClick={() => props.onTagClick(tag)}
                >
                  <span className="tag-name">{isUntagged ? 'Untagged' : tag}</span>
                  <span className="tag-count">{count}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="left-rail-footer">
        <div className="nav-icon-row">
          <button
            className="nav-icon-button"
            aria-label="Archived"
            title="Archived"
            onClick={props.onArchiveClick}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M1.5 3.5H13.5V5H1.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M2.3 5V11.5C2.3 12 2.7 12.4 3.2 12.4H11.8C12.3 12.4 12.7 12 12.7 11.5V5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 7.8H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {props.archivedCount > 0 && (
              <span className="nav-badge">{props.archivedCount}</span>
            )}
          </button>
          <button
            className="nav-icon-button"
            aria-label="Settings"
            title="Settings"
            onClick={props.onSettingsClick}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <button className="nav-button" onClick={props.onAboutClick}>
          About
        </button>
      </div>
    </div>
  );
}
