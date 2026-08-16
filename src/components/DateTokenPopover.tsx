import React, { useRef, useEffect } from 'react';
import './DateTokenPopover.css';

interface DateTokenPopoverProps {
  anchor: { top: number; left: number };
  onSelect: (iso: string) => void;
  onDismiss: () => void;
}

const DateTokenPopover = React.forwardRef<HTMLDivElement, DateTokenPopoverProps>(
  ({ anchor, onSelect, onDismiss }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Expose containerRef on the forwarded ref
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(containerRef.current);
        } else {
          ref.current = containerRef.current;
        }
      }
    }, [ref]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Guard: don't call onSelect if value is empty
      if (value) {
        onSelect(value);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    return (
      <div
        ref={containerRef}
        className="date-token-popover"
        style={{
          position: 'absolute',
          top: `${anchor.top}px`,
          left: `${anchor.left}px`,
        }}
      >
        <input
          ref={inputRef}
          type="date"
          autoFocus
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="date-token-popover__input"
        />
      </div>
    );
  }
);

DateTokenPopover.displayName = 'DateTokenPopover';

export default DateTokenPopover;
