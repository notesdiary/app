import React, { useRef, useState } from 'react';
import { Entry } from '../types';
import { formatTime, formatDate } from '../lib/dateUtils';
import { filterParagraphsInEntry } from '../lib/entryFiltering';
import { ViewMode } from '../lib/mode';
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea';
import { EntryContent } from './EntryContent';
import DateTokenPopover from './DateTokenPopover';
import { detectDateTrigger } from '../lib/dateTrigger';
import { getCaretCoordinates } from '../lib/caretPosition';
import './EntryRow.css';

interface EntryRowProps {
  entry: Entry;
  mode: ViewMode;
  selectedTags: string[];
  selectedDate: string | null;
  searchQuery: string;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onEditSave: () => void;
  onTagClick: (tag: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  onDateClick: (date: string, e: React.MouseEvent) => void;
  onRemove: () => void;
  onClickToEdit: () => void;
}

interface DatePopoverState {
  start: number;
  end: number;
  anchor: { top: number; left: number };
}

export const EntryRow: React.FC<EntryRowProps> = (props) => {
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useAutoGrowTextarea(editTextareaRef, props.editText);
  const [hovering, setHovering] = useState(false);
  const [datePopover, setDatePopover] = useState<DatePopoverState | null>(null);

  const handleEditTextChange = (text: string) => {
    props.onEditTextChange(text);

    // Detect date trigger
    const trigger = detectDateTrigger(text, editTextareaRef.current?.selectionStart ?? 0);

    if (trigger) {
      // Compute anchor position at the @ character
      const coords = getCaretCoordinates(editTextareaRef.current!, trigger.start);

      // Find the end of the trigger (@ followed by digits)
      const afterAt = text.slice(trigger.start + 1);
      const digitMatch = afterAt.match(/^\d+/);
      const endPos = digitMatch ? trigger.start + 1 + digitMatch[0].length : trigger.start + 1;

      setDatePopover({
        start: trigger.start,
        end: endPos,
        anchor: { top: coords.top, left: coords.left },
      });
    } else if (datePopover) {
      // Close popover if it was open and trigger no longer matches
      setDatePopover(null);
    }
  };

  const handleDateSelect = (iso: string) => {
    if (!datePopover || !editTextareaRef.current) return;

    const { start, end } = datePopover;
    const newText = props.editText.slice(0, start) + '@' + iso + props.editText.slice(end);

    props.onEditTextChange(newText);
    setDatePopover(null);

    // Refocus textarea and position cursor after inserted token
    requestAnimationFrame(() => {
      editTextareaRef.current?.focus();
      const newPos = start + 1 + iso.length;
      editTextareaRef.current?.setSelectionRange(newPos, newPos);
    });
  };

  const handleDateDismiss = () => {
    setDatePopover(null);
    editTextareaRef.current?.focus();
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // Blur guard: skip onEditSave if popover is open or focus moved to popover
    if (datePopover) {
      // If relatedTarget is inside popover, don't save (let popover handle it)
      if (e.relatedTarget && popoverRef.current?.contains(e.relatedTarget as Node)) {
        return;
      }
      // If relatedTarget is null (focus lost to non-DOM element), don't save
      if (!e.relatedTarget) {
        return;
      }
    }

    props.onEditSave();
  };

  if (props.isEditing) {
    return (
      <div className="entry-row editing">
        <textarea
          ref={editTextareaRef}
          className="entry-edit-textarea"
          value={props.editText}
          onChange={(e) => handleEditTextChange(e.target.value)}
          onBlur={handleBlur}
          autoFocus
        />
        {datePopover && (
          <DateTokenPopover
            ref={popoverRef}
            anchor={datePopover.anchor}
            onSelect={handleDateSelect}
            onDismiss={handleDateDismiss}
          />
        )}
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
        <div className="entry-date">{md}</div>
        <button
          className={`entry-remove-button ${hovering ? 'visible' : ''}`}
          onClick={props.onRemove}
          title="Archive entry"
        >
          ×
        </button>
      </div>

      <div className="entry-paragraphs">
        {filterParagraphsInEntry(props.entry, props.mode, props.selectedTags, props.searchQuery, props.selectedDate).map((section, idx) => (
          <EntryContent
            key={idx}
            text={section}
            interactive={true}
            onTagClick={props.onTagClick}
            onDateClick={props.onDateClick}
            onSectionClick={props.onClickToEdit}
          />
        ))}
      </div>
    </div>
  );
};
