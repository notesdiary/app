/**
 * Get the coordinates of the caret at a specific position in a textarea.
 * Uses the mirror-div technique: copies textarea styles to a hidden div,
 * sets content up to the position with a measurement span, and measures where that ends.
 *
 * @param textarea - The textarea element
 * @param position - The character position in the textarea value
 * @returns {top, left, height} coordinates relative to the viewport, or {top: 0, left: 0, height: 0} on error
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const div = document.createElement('div');

  try {
    // Copy all computed styles from textarea to div
    const style = window.getComputedStyle(textarea);
    const props = [
      'direction', // RTL support
      'boxSizing',
      'width',
      'height',
      'overflowX',
      'overflowY',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'fontSizeAdjust',
      'lineHeight',
      'fontFamily',
      'textAlign',
      'textTransform',
      'textIndent',
      'textDecoration',
      'letterSpacing',
      'wordSpacing',
      'tabSize',
      'whiteSpace',
      'wordWrap',
      'wordBreak',
    ];

    props.forEach((prop) => {
      (div.style as any)[prop] = (style as any)[prop];
    });

    // Set additional styles for measuring
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';

    // Get text up to position
    const textBefore = textarea.value.slice(0, position);

    // Create a span for text measurement
    const span = document.createElement('span');
    span.textContent = textBefore;
    span.style.position = 'relative';
    span.style.display = 'inline';

    // Add span to div
    div.appendChild(span);

    // Append to document to measure
    document.body.appendChild(div);

    // Measure using offsetWidth (works better in jsdom)
    const textareaRect = textarea.getBoundingClientRect();
    const textareaStyle = window.getComputedStyle(textarea);

    // Get padding and border for offset calculation
    const paddingLeft = parseFloat(textareaStyle.paddingLeft) || 0;
    const paddingTop = parseFloat(textareaStyle.paddingTop) || 0;
    const borderLeft = parseFloat(textareaStyle.borderLeftWidth) || 0;
    const borderTop = parseFloat(textareaStyle.borderTopWidth) || 0;

    // Calculate position using offsetWidth of the span
    // The span's offsetLeft is 0 (it starts at the div's start)
    // The caret is at span.offsetLeft + span.offsetWidth
    const relativeLeft = span.offsetWidth;
    const relativeTop = span.offsetHeight / 2; // Approximate top of caret within line

    // Calculate absolute position
    const left = textareaRect.left + borderLeft + paddingLeft + relativeLeft;
    const top = textareaRect.top + borderTop + paddingTop + relativeTop;

    // Estimate height as line height
    const computedLineHeight = window.getComputedStyle(textarea).lineHeight;
    let height = 16; // Default fallback
    if (computedLineHeight && computedLineHeight !== 'normal') {
      const parsed = parseFloat(computedLineHeight);
      if (!isNaN(parsed)) {
        height = parsed;
      }
    }

    // Account for scroll offset
    const scrollLeft = textarea.scrollLeft || 0;
    const scrollTop = textarea.scrollTop || 0;

    return {
      top: top - scrollTop,
      left: left - scrollLeft,
      height,
    };
  } catch {
    // On any error, return safe defaults
    return { top: 0, left: 0, height: 0 };
  } finally {
    // Always clean up the mirror div
    if (div.parentNode) {
      div.parentNode.removeChild(div);
    }
  }
}
