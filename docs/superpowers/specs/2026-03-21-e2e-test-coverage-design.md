# E2E Test Coverage Expansion — Design Spec

**Date:** 2026-03-21
**Status:** Draft

## Problem

The Swanki web app has 2 Playwright spec files covering import/study flows and template preview rendering. Major features have zero e2e coverage: browse, stats, settings, deck management, note-type CRUD, study keyboard shortcuts/undo/suspend/bury, and auth edge cases.

## Goals

- Comprehensive e2e coverage across all user-facing pages
- Each spec file is independent — no cross-spec state dependencies
- Seeded database provides stable baseline data; specs create throwaway entities for mutations
- Address any bugs discovered during test development

## Non-Goals

- Desktop (Electron) e2e tests
- Mobile responsive/viewport testing
- Performance or load testing
- CSV/CrowdAnki import formats (existing APKG/COLPKG coverage is sufficient)

---

## Infrastructure

### Seed Data Script

Extend the existing `e2e/setup-db.ts` (which already applies migrations) to also insert baseline seed data. The seed runs once during global setup, populating `sqlite-e2e.db` alongside the existing user registration.

**Seed contents:**

| Entity          | Details                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Decks (4)       | "Spanish" (parent), "Spanish::Verbs" (child of Spanish), "Math" (standalone), "Empty" (no cards) |
| Note types (2)  | "Basic" (fields: Front, Back), "Cloze" (fields: Text, Extra)                                     |
| Notes (6)       | 4 Basic notes in Spanish::Verbs, 1 Basic + 1 Cloze in Math                                       |
| Cards           | Mixed states: some new (state 0), some review (state 2) with past due dates                      |
| Review logs (5) | Spread across 3 recent days — provides stats data for streak/heatmap/chart                       |

All IDs are deterministic UUIDs so specs can reference them directly.

**No media files** — import tests already cover media. **No auth data** — global setup handles user creation.

### Seed Data Constants

`e2e/helpers/seed-data.ts` exports deterministic IDs and constants:

```ts
export const SEED = {
  decks: {
    spanish: { id: "...", name: "Spanish" },
    spanishVerbs: { id: "...", name: "Spanish::Verbs" },
    math: { id: "...", name: "Math" },
    empty: { id: "...", name: "Empty" },
  },
  noteTypes: {
    basic: { id: "...", name: "Basic", fields: ["Front", "Back"] },
    cloze: { id: "...", name: "Cloze", fields: ["Text", "Extra"] },
  },
  notes: {
    /* per-note IDs and field values */
  },
} as const;
```

### API Helpers

`e2e/helpers/api.ts` provides typed functions for specs that need throwaway data:

```ts
createDeck(page, { name, parentId? }) → { id }
createNoteType(page, { name, fields }) → { id }
createNote(page, { noteTypeId, deckId, fields }) → { id }
deleteDeck(page, deckId) → void
deleteNoteType(page, noteTypeId) → void
deleteNote(page, noteId) → void
```

These use `page.request.post/delete` against the existing API routes.

### Global Setup Changes

`e2e/global-setup.ts` updated to call the seed insertion after migration and user registration. The seed script is idempotent — uses INSERT OR IGNORE so re-runs don't fail.

### Playwright Config Changes

`playwright.config.ts` updated with explicit test file ordering via `testDir` and `testMatch` array to control execution order.

---

## Test Isolation Strategy

Since Playwright runs with `workers: 1` and `fullyParallel: false`, all tests share one server and one database.

**Principles:**

1. Seeded data is the stable baseline — tests read from it but never destroy it
2. Tests that mutate data create their own throwaway entities via API helpers, then operate on those
3. Truly destructive tests (sign out, delete account) run last
4. Each spec is internally serial (`test.describe.configure({ mode: "serial" })`) where tests build on prior state within the same describe block

---

## Execution Order

| Order | File                                  | Strategy                             |
| ----- | ------------------------------------- | ------------------------------------ |
| 1     | `import-and-study.spec.ts` (existing) | Creates import data                  |
| 2     | `template-preview.spec.ts` (existing) | Creates own data via API             |
| 3     | `stats.spec.ts`                       | Reads seeded review history          |
| 4     | `browse.spec.ts`                      | Reads seed + creates throwaway notes |
| 5     | `deck-management.spec.ts`             | Creates throwaway decks              |
| 6     | `note-types.spec.ts`                  | Creates throwaway note types         |
| 7     | `study-actions.spec.ts`               | Creates own deck+notes via API       |
| 8     | `settings.spec.ts`                    | Harmless mutations (theme, name, pw) |
| 9     | `auth-edge-cases.spec.ts`             | Destructive (sign-out) — runs last   |

---

## New Spec Files

### 1. `stats.spec.ts`

Tests the `/stats` page using seeded review history data.

**Tests:**

- **Streak display renders** — Verify flame icon + current streak number, trophy icon + longest streak number are visible
- **Reviews per day chart renders** — Bar chart visible with data from seeded reviews
- **Period selector switches data** — Click "7 days", "30 days", "90 days", "Year" buttons; verify active button styling changes and chart re-renders
- **Card states pie chart** — Legend shows "New", "Review" (etc.) labels with counts matching seeded card states; total count shown
- **Heatmap renders current year** — Year label visible, colored cells present for days with reviews
- **Heatmap year navigation** — Click Previous, verify year decrements; Next disabled at current year
- **Heatmap cell tooltip** — Hover cell with reviews, verify tooltip shows "X reviews on YYYY-MM-DD"

### 2. `browse.spec.ts`

Tests the `/browse` page. Creates throwaway notes for mutation tests.

**Tests:**

- **Page loads with notes** — Navigate to `/browse`, verify note table shows rows with seeded data
- **Free-text search** — Type search term, press Enter; verify filtered results
- **Filter by deck** — Select "Math" from deck dropdown; verify only Math notes shown
- **Filter by note type** — Select "Cloze" from note type dropdown; verify filtered results
- **State toggle buttons** — Click "new" toggle; verify `is:new` appears in search and results filter
- **Pagination** — If enough results, verify page indicator and next/previous buttons work
- **Click note opens editor** — Click a note row; verify editor modal opens with correct field values
- **Edit note fields** — Change a field value in editor, click Save; verify "success" and updated value persists on reload
- **Move note to different deck** — Change deck dropdown in editor, save; verify deck column updates
- **Suspend note** — Click Suspend in editor; verify suspended state in table
- **Unsuspend note** — Click Unsuspend; verify state reverts
- **Delete note** — Click Delete in editor, confirm; verify note removed from table
- **Empty results** — Search for nonexistent term; verify "No notes found" message

### 3. `deck-management.spec.ts`

Tests deck CRUD on the dashboard (`/`). Creates throwaway decks.

**Tests:**

- **Seeded decks visible** — Dashboard shows "Spanish", "Math", "Empty" deck names
- **Nested deck visible** — "Verbs" visible under "Spanish" hierarchy
- **Card count badges** — Verify new/learning/due badges show correct numbers for seeded decks
- **Empty deck shows zero counts** — "Empty" deck shows 0 for all badges
- **Create deck** — Click "Add Deck", enter name, submit; verify new deck appears in tree
- **Rename deck** — Open deck settings dialog, change name, save; verify updated name in tree
- **Delete deck** — Open deck action menu, click delete, confirm; verify deck removed
- **Delete deck re-parents children** — Create parent+child, delete parent; verify child moves to root
- **Click deck navigates to study** — Click deck name; verify URL changes to `/study/{deckId}`

### 4. `note-types.spec.ts`

Tests note-type management on `/note-types`. Creates throwaway note types.

**Tests:**

- **Page shows seeded note types** — "Basic" and "Cloze" cards visible with field/template counts
- **Create note type** — Click "New Note Type", enter name + fields, submit; verify card appears
- **Edit note type name** — Open editor, change name, save; verify updated name on card
- **Add field** — In Fields tab, add new field; verify field appears in list
- **Remove field** — Delete a field (when >1 exists); verify removed
- **Cannot remove last field** — Delete button disabled when only 1 field remains
- **Delete note type (no notes)** — Delete a throwaway note type; verify removed from grid
- **Delete note type (has notes) fails** — Try deleting "Basic" (has seeded notes); verify error message
- **Create card template** — Click "Add Template"; verify new template appears in accordion
- **Edit template** — Change question/answer template text, save; verify persisted

### 5. `study-actions.spec.ts`

Tests study features beyond basic show/rate. Creates its own deck with notes via API.

**Setup:** Create a deck "StudyTest" with 3 Basic notes (3 cards — 1 card per note) via API.

**Tests:**

- **Study page loads with progress** — Navigate to `/study/{deckId}`; verify progress counters show correct new/learning/review counts
- **Space shows answer** — Press Space; verify answer content and rating buttons appear
- **Keyboard rating (1-4)** — Show answer, press "3"; verify next card loads
- **Rating buttons show intervals** — Show answer; verify each button displays interval text (e.g., "1m", "10m", "1d")
- **Progress decrements** — Review a card; verify progress counter decreases
- **Undo review (Z key)** — Rate a card, press Z; verify undo button disappears and card reappears
- **Suspend card from menu** — Open three-dot menu, click Suspend; verify next card loads (suspended card gone)
- **Bury card from menu** — Open three-dot menu, click Bury; verify next card loads (buried card gone)
- **Congrats screen** — Review all remaining cards; verify "Congratulations!" message and card count
- **Congrats back to dashboard** — Click "Back to Dashboard"; verify navigation to `/`
- **Empty deck shows congrats immediately** — Navigate to study for "Empty" seeded deck; verify congrats screen

### 6. `settings.spec.ts`

Tests the `/settings` page. Mutations are harmless (theme, display name).

**Tests:**

- **Profile section loads** — Display name input has current value, email is disabled
- **Update display name** — Change name, click Save; verify "Saved" message appears
- **Save disabled when unchanged** — Verify Save button is disabled without edits
- **Theme: light** — Click Light radio; verify `<html>` element does not have `dark` class
- **Theme: dark** — Click Dark radio; verify `<html>` element has `dark` class
- **Theme: system** — Click System radio; verify selection highlighted
- **Change password: too short** — Enter <8 char password, submit; verify error message
- **Change password: mismatch** — Enter mismatched confirm, submit; verify error message
- **Change password: success** — Enter valid current + new password, submit; verify success message and fields cleared. Then change password back to original to preserve test user credentials for future runs.

### 7. `auth-edge-cases.spec.ts`

Tests auth error states and guards. Runs last since sign-out/delete are destructive.

**Tests:**

- **Unauthenticated redirect** — Clear storage state, navigate to `/browse`; verify redirect to `/login`
- **Login with wrong password** — Fill login form with bad password; verify error message
- **Register with duplicate email** — Fill register form with existing email; verify error message
- **Delete account modal** — Open delete modal; verify "Permanently Delete Account" button is disabled
- **Delete account requires exact "DELETE"** — Type "delete" (lowercase); verify button stays disabled. Type "DELETE"; verify button enables
- **Sign out** — Click Sign Out; verify redirect to `/login`. This test runs last because `authClient.signOut()` invalidates the server-side session, making the stored session cookie unusable for subsequent tests.

**Note:** Actual account deletion is not tested to avoid destroying the test user. The sign-out test is the final test in the entire suite.

---

## Shared Test Helpers

### `e2e/helpers/api.ts`

CRUD helpers wrapping `page.request` for creating throwaway entities.

### `e2e/helpers/seed-data.ts`

Deterministic IDs and constants for referencing seeded data.

### Existing Helpers (unchanged)

- `e2e/helpers/import.ts` — Import wizard helpers
- `e2e/helpers/study.ts` — Study flow + media assertion helpers

---

## Files Changed

| File                          | Change                                       |
| ----------------------------- | -------------------------------------------- |
| `e2e/setup-db.ts`             | Add seed data insertion after migrations     |
| `e2e/global-setup.ts`         | Call seed insertion in setup flow            |
| `e2e/helpers/seed-data.ts`    | New — deterministic IDs and constants        |
| `e2e/helpers/api.ts`          | New — CRUD helpers for throwaway entities    |
| `playwright.config.ts`        | Add `testMatch` array for execution ordering |
| `e2e/stats.spec.ts`           | New                                          |
| `e2e/browse.spec.ts`          | New                                          |
| `e2e/deck-management.spec.ts` | New                                          |
| `e2e/note-types.spec.ts`      | New                                          |
| `e2e/study-actions.spec.ts`   | New                                          |
| `e2e/settings.spec.ts`        | New                                          |
| `e2e/auth-edge-cases.spec.ts` | New                                          |
