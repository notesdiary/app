import { useRef } from 'react';
import { formatTime } from '../lib/dateUtils';
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea';
import './Composer.css';

interface ComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  onBlur: () => void;
}

export function Composer(props: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(textareaRef, props.text);

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTime = formatTime(`${hours}:${minutes}`);

  return (
    <div className="composer">
      <div className="composer-time">{currentTime}</div>
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Write a note, use #tags to organize it..."
        value={props.text}
        onChange={(e) => props.onTextChange(e.target.value)}
        onBlur={props.onBlur}
      />
    </div>
  );
}
