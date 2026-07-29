import React, { useRef, useState } from 'react';
import { Entry } from '../types';
import { formatTime, formatDate } from '../lib/dateUtils';
import { splitParts } from '../lib/tags';
import { filterParagraphsInEntry } from '../lib/entryFiltering';
import { ViewMode } from '../lib/mode';
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea';
import './EntryRow.css';

interface EntryRowProps {
  entry: Entry;
  mode: ViewMode;
  selectedTags: string[];
  searchQuery: string;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onEditSave: () => void;
  onTagClick: (tag: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  onRemove: () => void;
  onClickToEdit: () => void;
}

export const EntryRow: React.FC<EntryRowProps> = (props) => {
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(editTextareaRef, props.editText);
  const [hovering, setHovering] = useState(false);

  if (props.isEditing) {
    return (
      <div className="entry-row editing">
        <textarea
          ref={editTextareaRef}
          className="entry-edit-textarea"
          value={props.editText}
          onChange={(e) => props.onEditTextChange(e.target.value)}
          onBlur={props.onEditSave}
          autoFocus
        />
      </div>
    );
  }

  const { md } = formatDate(props.entry.date);
  const timeFormatted = formatTime(props.entry.time);

  return (
    <div
      className="entry-row"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="entry-header">
        <div className="entry-time">{timeFormatted}</div>
        {props.mode !== 'day' && <div className="entry-date">{md}</div>}
        <button
          className={`entry-remove-button ${hovering ? 'visible' : ''}`}
          onClick={props.onRemove}
          title="Archive entry"
        >
          ×
        </button>
      </div>

      <div className="entry-paragraphs">
        {filterParagraphsInEntry(props.entry, props.mode, props.selectedTags, props.searchQuery).map((section, idx) => {
          const parts = splitParts(section);
          return (
            <div key={idx} className="entry-paragraph" onClick={props.onClickToEdit}>
              {parts.map((part, i) =>
                part.isTag ? (
                  <button
                    key={i}
                    className="tag-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onTagClick(part.text, e);
                    }}
                  >
                    {part.text}
                  </button>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
