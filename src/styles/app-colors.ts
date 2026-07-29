/**
 * Design color tokens for Notes Diary
 * Source of truth: prototype hardcoded hex values
 */

export const AppColors = {
  // Primary brand colors
  navy: '#081A59',           // Primary brand color
  cyan: '#00A9CE',           // Primary action, links
  cyanHover: '#22D0EF',      // Hover state for cyan
  teal: '#008C95',           // Labels, badges (e.g., "Today" badge)

  // Secondary colors
  orange: '#FF8200',         // Pending sync indicator dot

  // Neutral/UI colors
  border: '#DDE0EC',         // Border color for inputs, cards
  gray: '#53565A',           // Secondary text, labels
  entryText: '#24304A',      // Primary text color for entries
  lightBlueSurface: '#D9FAFF', // Light background, highlights
  railBg: '#F5FBFD',         // Left/right rail background

  // Semantic
  white: '#FFFFFF',
  black: '#000000',

  // Background with opacity
  backdropOverlay: 'rgba(8, 26, 89, 0.35)', // Mobile drawer backdrop
} as const

/**
 * Typography tokens (to be imported from tokens.css or defined here)
 * Using system fonts as placeholder until design tokens are provided
 */
export const Typography = {
  fontFamily: {
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const
