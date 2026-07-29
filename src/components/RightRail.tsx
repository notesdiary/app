import { Entry } from '../types';
import { splitParts, splitSections } from '../lib/tags';
import './RightRail.css';

interface RightRailProps {
  entries: Entry[];
  selectedTags: string[];
  onTagClick: (tag: string) => void;
  isMobile: boolean;
  isOpen: boolean;
}

export function RightRail(props: RightRailProps) {
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
    <div className={`right-rail ${props.isMobile ? 'mobile' : 'desktop'} ${props.isOpen ? 'open' : 'closed'}`}>
      <div className="right-rail-header">Browse by tag</div>

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
  );
}
