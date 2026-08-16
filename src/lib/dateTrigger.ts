/**
 * Detects a date trigger pattern in text at a given caret position.
 *
 * A date trigger is a pattern like "@1", "@2", "@20", etc., which appears at the
 * end of the text before the caret position, optionally preceded by whitespace or
 * appearing at the start of the text.
 *
 * @param text - The full text content
 * @param caretPos - The cursor position within the text
 * @returns An object with the start index of @ if a date trigger is found, null otherwise
 */
export function detectDateTrigger(
  text: string,
  caretPos: number
): { start: number } | null {
  const beforeCaret = text.slice(0, caretPos);

  // Pattern: (start of string or whitespace) followed by @ followed by digits at end
  if (!beforeCaret.match(/(?:^|\s)@\d+$/)) {
    return null;
  }

  // Find the position of @ in beforeCaret
  const atPos = beforeCaret.lastIndexOf('@');
  return { start: atPos };
}
