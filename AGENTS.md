# Notes Diary — Agent Guide

Notes Diary is a local-first diary web app built with React + TypeScript + Vite, storing data in IndexedDB with optional Google Drive backup.

## Quick Start

### Development Server

Run the development server (hot-reload enabled):

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Testing

Run the test suite with Vitest:

```bash
npm test
```

Run tests in watch mode:

```bash
npm test -- --watch
```

### Building

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

```
src/
├── components/          # React UI components
│   ├── App.tsx         # Root app component with state management
│   ├── LeftRail.tsx    # Left sidebar with date picker and navigation
│   ├── RightRail.tsx   # Right sidebar with tag browser
│   ├── DiaryView.tsx   # Main diary/entry view
│   ├── ArchiveView.tsx # Archived entries view
│   ├── SettingsView.tsx# Settings and Google Drive sync panel
│   └── ...             # Other UI components
├── hooks/              # React hooks
│   ├── useWindowWidth.ts      # Responsive width tracking
│   └── useAutoGrowTextarea.ts # Auto-growing textarea
├── lib/                # Core business logic and utilities
│   ├── db.ts          # IndexedDB setup and initialization
│   ├── entriesRepo.ts # Entry CRUD operations
│   ├── metaRepo.ts    # Metadata storage (dates, sync state)
│   ├── dateUtils.ts   # Date formatting and utilities
│   ├── tags.ts        # Tag parsing and extraction
│   ├── mode.ts        # View mode derivation (day/tag/search)
│   ├── entryFiltering.ts # Entry filtering logic
│   └── googleAuth.ts  # Google OAuth integration
├── styles/            # CSS and design tokens
│   ├── tokens.css     # Design tokens (colors, typography)
│   └── app-colors.ts  # TypeScript color constants
├── types.ts           # TypeScript type definitions
├── main.tsx           # React app entry point
├── App.css            # App layout styles
├── index.css          # Global base styles
├── __tests__/         # Unit tests
└── assets/            # Static assets
    └── fonts/         # Custom font files
```

## Key Features

- **Local-first storage**: All data stored in IndexedDB, persists offline
- **Hashtag organization**: Inline `#tags` in notes for quick organization
- **Multiple views**: Day view, tag filter, search across all notes
- **Archive**: Soft-delete entries, restore them later
- **Google Drive backup**: Optional one-way sync to Google Drive
- **Responsive design**: Mobile-optimized with drawer navigation
- **PWA installable**: Install on home screen, works offline

## Architecture Notes

### State Management

Global state is managed in `App.tsx` using React hooks:
- `entries`: In-memory array of all active diary entries
- `selectedDate`: Currently selected date in day view
- `selectedTags`: Array of tag filters in tag view
- `searchQuery`: Search text for search view
- `editingId` / `draftText`: Edit-in-place state
- `view`: Current view ('diary' | 'archive' | 'settings')
- `leftOpen` / `rightOpen`: Mobile drawer state

Every mutation writes through to IndexedDB and updates in-memory state immediately.

### Data Layer

- **IndexedDB schema** defined in `lib/db.ts`
  - `entries` store: diary entries indexed by date
  - `meta` store: app-level metadata (sync state, extra dates)

### Tag Parsing

Tags are derived at render time (never persisted):
- Pattern: `#[a-zA-Z][\w-]*`
- Multi-select filtering in tag view
- Special `__untagged__` pseudo-tag for tagless paragraphs

### Google Drive Integration

Filter-mode-only sync:
1. User connects via OAuth (Google Identity Services) with no backup mode selection
2. Backups stored per filter rule (user-named files) + auto-seeded remainder rule (`notesdiary-backup.json`)
3. Per-rule "Sync now" + "Sync filters now" button to sync all rules at once
4. Per-rule sync status tracked in `meta` store via `filter-sync-state` and `filter-rules` keys
5. Merge: union by entry ID, local wins on conflict
6. New users auto-seeded with default remainder rule (no manual setup required)
7. Legacy month-based files (e.g., "July 2026.json") left untouched in Drive

## Implementation Plan

The complete implementation plan with all tasks and acceptance criteria is located in:

**[`plans/notes-diary-app.md`](./plans/notes-diary-app.md)**

This document defines:
- Detailed task breakdowns (sections 2–7)
- Data schema and API contracts
- UI component specs
- Test scenarios
- Acceptance criteria for v1 launch

## Testing

Test files are located in `src/__tests__/` using Vitest + React Testing Library:

- `smoke.test.ts`: Basic sanity checks
- `dateUtils.test.ts`: Date formatting utilities
- `tags.test.ts`: Tag parsing and extraction
- `mode.test.ts`: View mode derivation logic
- `entryFiltering.test.ts`: Entry filtering for different views
- `entriesRepo.test.ts`: IndexedDB operations

Run tests with:

```bash
npm test
```

## Development Guidelines

### Adding a New Feature

1. Define types in `src/types.ts` (if needed)
2. Add business logic to `src/lib/`
3. Create React components in `src/components/`
4. Add unit tests in `src/__tests__/`
5. Integrate into `App.tsx` state if needed

### Colors and Styling

- Color constants defined in `src/styles/app-colors.ts`
- CSS custom properties in `src/styles/tokens.css`
- Component-scoped CSS in `.css` files alongside components

### Mobile Responsive

- Breakpoint: `960px`
- Below 960px: Rails become fixed drawers, hamburger menu appears
- Use `useWindowWidth()` hook to detect mobile state

## Environment Variables

Create a `.env.local` file in the repo root (gitignored) for local development:

```
VITE_GOOGLE_CLIENT_ID=<your-client-id>
```

This is required for Google Drive OAuth. See `plans/notes-diary-app.md` task 6.0.1 for setup steps.

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm test` | Run test suite |
| `npm test -- --watch` | Watch mode for tests |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

## Troubleshooting

### Tests fail with "IndexedDB not defined"

Make sure `jsdom` is configured in `vitest.config.ts` as the test environment.

### Mobile drawer not closing

Check that `closeDrawersOnMobile()` is called after navigation actions in `App.tsx`.

### Tags not appearing in the right rail

Verify that `extractTags()` is correctly parsing the tag pattern `#[a-zA-Z][\w-]*`.

---

**Plan reference**: [`plans/notes-diary-app.md`](./plans/notes-diary-app.md)

**Main app entry**: `src/main.tsx` → `src/App.tsx`
