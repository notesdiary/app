import React, { useRef, useState } from 'react';
import { formatTime } from '../lib/dateUtils';
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea';
import DateTokenPopover from './DateTokenPopover';
import { detectDateTrigger } from '../lib/dateTrigger';
import { getCaretCoordinates } from '../lib/caretPosition';
import './Composer.css';

interface ComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  onBlur: () => void;
}

interface DatePopoverState {
  start: number;
  end: number;
  anchor: { top: number; left: number };
}

export function Composer(props: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useAutoGrowTextarea(textareaRef, props.text);
  const [datePopover, setDatePopover] = useState<DatePopoverState | null>(null);

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = formatTime(`${hours}:${minutes}`);

  const handleTextChange = (text: string) => {
    props.onTextChange(text);

    // Detect date trigger
    const trigger = detectDateTrigger(text, textareaRef.current?.selectionStart ?? 0);

    if (trigger) {
      // Compute anchor position at the @ character
      const coords = getCaretCoordinates(textareaRef.current!, trigger.start);

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
    if (!datePopover || !textareaRef.current) return;

    const { start, end } = datePopover;
    const newText = props.text.slice(0, start) + '@' + iso + props.text.slice(end);

    props.onTextChange(newText);
    setDatePopover(null);

    // Refocus textarea and position cursor after inserted token
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const newPos = start + 1 + iso.length;
      textareaRef.current?.setSelectionRange(newPos, newPos);
    });
  };

  const handleDateDismiss = () => {
    setDatePopover(null);
    textareaRef.current?.focus();
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // Blur guard: skip onBlur if popover is open or focus moved to popover
    if (datePopover) {
      // If relatedTarget is inside popover, don't call onBlur (let popover handle it)
      if (e.relatedTarget && popoverRef.current?.contains(e.relatedTarget as Node)) {
        return;
      }
      // If relatedTarget is null (focus lost to non-DOM element), don't call onBlur
      if (!e.relatedTarget) {
        return;
      }
    }

    props.onBlur();
  };

  return (
    <div className="composer">
      <div className="composer-time">{currentTime}</div>
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Write a note, use #tags to organize it..."
        value={props.text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
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
