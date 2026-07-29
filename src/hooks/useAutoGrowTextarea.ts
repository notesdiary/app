import { useEffect, RefObject } from 'react';

export function useAutoGrowTextarea(ref: RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      const scrollHeight = ref.current.scrollHeight;
      const maxHeight = window.innerHeight * 0.66;
      const newHeight = Math.min(scrollHeight, maxHeight);
      ref.current.style.height = newHeight + 'px';
    }
  }, [value]);
}
