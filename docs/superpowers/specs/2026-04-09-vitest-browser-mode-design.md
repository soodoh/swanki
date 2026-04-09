# Vitest Browser Mode Migration

## Goal

Set up Vitest browser mode with Playwright provider for component-level testing. Remove unused testing dependencies (`@testing-library/react`, `@testing-library/jest-dom`, `jsdom`). Ship initial component tests to prove out the infrastructure.

Existing unit tests (pure Node.js, in-memory SQLite) remain unchanged and continue running in node environment for efficiency.

## Approach: Vitest Workspace Projects

Use Vitest's workspace feature to define two projects separated by file extension:

- **`unit`** — `environment: "node"`, includes `src/**/*.test.ts`
- **`browser`** — `browser.enabled: true`, provider `playwright`, browser `chromium`, includes `src/**/*.test.tsx`

A single `vitest` command runs both projects. The `.ts` vs `.tsx` extension convention is the only rule for determining which environment a test runs in.

## Configuration

### `apps/web/vitest.workspace.ts` (new)

Replaces the current `apps/web/vitest.config.ts`.

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    plugins: [tsconfigPaths()],
    test: {
      name: "unit",
      environment: "node",
      include: ["src/**/*.test.ts"],
      globals: true,
    },
  },
  {
    plugins: [tsconfigPaths()],
    test: {
      name: "browser",
      include: ["src/**/*.test.tsx"],
      browser: {
        enabled: true,
        provider: "playwright",
        instances: [{ browser: "chromium" }],
      },
    },
  },
]);
```

### `apps/web/vitest.config.ts` (deleted)

Replaced by the workspace file above. All existing behavior (node environment, globals, tsconfig paths) is preserved in the `unit` project.

## Dependency Changes

### Add

| Package | Purpose |
|---------|---------|
| `@vitest/browser` | Vitest browser mode integration |
| `playwright` | Browser engine for Vitest browser provider |

### Remove

| Package | Reason |
|---------|--------|
| `@testing-library/react` | Unused — zero imports across codebase |
| `@testing-library/jest-dom` | Unused — zero imports across codebase |
| `jsdom` | Unused — vitest config already uses `environment: "node"` |

### Unchanged

| Package | Purpose |
|---------|---------|
| `@playwright/test` | Used by existing E2E tests — unrelated to browser mode |
| `vitest` | Already at ^4.1.0, supports browser mode |

## Component Test Convention

- **Location:** Colocated next to the component (e.g., `components/study/rating-buttons.test.tsx`)
- **Extension:** `.test.tsx` — this is what routes tests to the browser project
- **Rendering:** Use `@vitest/browser/context` for `page` and Playwright locators
- **Interactions:** Playwright locator API (`getByRole`, `getByText`, `click`, `fill`, etc.)

## Initial Component Tests

Three components chosen to exercise different testing patterns with zero provider/mocking requirements:

### 1. RatingButtons (`components/study/rating-buttons.test.tsx`)

**Component:** Pure presentation, zero hooks/context. Takes `previews`, `disabled`, and `onRate` props.

**Tests:**
- Renders all 4 rating buttons (Again, Hard, Good, Easy) with correct labels
- Displays formatted interval previews (minutes, hours, days, months, years)
- Fires `onRate` callback with correct rating number on click
- Disabled state prevents interaction

**Pattern exercised:** Basic mounting, locator queries, click events, callback assertions.

### 2. StudyProgress (`components/study/study-progress.test.tsx`)

**Component:** Pure presentation with math. Takes `counts` and `initialTotal` props.

**Tests:**
- Renders correct counts for new/learning/review cards
- Progress bar width reflects calculated percentage
- Handles zero-total edge case without division errors

**Pattern exercised:** DOM attribute assertions, computed values.

### 3. SearchBar (`components/browse/search-bar.test.tsx`)

**Component:** Local state with keyboard handling. Takes `value`, `onChange`, `onSubmit` props.

**Tests:**
- Renders with initial value in input
- Typing updates the input and fires onChange
- Enter key triggers onSubmit with current value
- External value prop change syncs to local state

**Pattern exercised:** Keyboard events, input interactions, useEffect sync behavior.

## File Structure

```
apps/web/
├── vitest.workspace.ts              # NEW — replaces vitest.config.ts
├── src/
│   ├── __tests__/                   # existing unit tests (*.test.ts) — unchanged
│   ├── components/
│   │   ├── study/
│   │   │   ├── rating-buttons.tsx
│   │   │   ├── rating-buttons.test.tsx      # NEW
│   │   │   ├── study-progress.tsx
│   │   │   └── study-progress.test.tsx      # NEW
│   │   └── browse/
│   │       ├── search-bar.tsx
│   │       └── search-bar.test.tsx          # NEW
```

## npm Scripts

No changes needed. Existing scripts work as-is:

- `bun run test` → `vitest` (auto-discovers workspace, runs both projects)
- `bun run test:run` → `vitest run` (CI mode, both projects)

## Risk & Migration

- **Zero risk to existing tests:** Unit tests are an isolated workspace project with identical config to the current `vitest.config.ts`.
- **E2E tests unaffected:** Playwright E2E tests use `@playwright/test` and a separate `playwright.config.ts` — completely independent of Vitest browser mode.
- **`playwright` vs `@playwright/test`:** These are separate packages. `playwright` provides browser engines for Vitest's browser provider. `@playwright/test` is the E2E test framework. Both can coexist.

## Future Work (out of scope)

- Component tests requiring providers (TransportProvider, QueryClientProvider, Router)
- Test helper for wrapping components with common providers
- Testing drag-and-drop interactions (DeckTree, NoteTypeEditorTabs)
- Coverage configuration for browser mode tests
