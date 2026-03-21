# E2E Test Coverage Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 new Playwright e2e spec files covering all untested pages (browse, stats, settings, deck management, note types, study actions, auth edge cases) with seeded database infrastructure.

**Architecture:** Extend `e2e/setup-db.ts` to seed baseline data after migrations. Each spec file is independent — reads seeded data for assertions and creates throwaway entities via API helpers for mutations. Tests run in a fixed order with destructive tests last.

**Tech Stack:** Playwright, Bun SQLite (for seeding), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-21-e2e-test-coverage-design.md`

---

## File Structure

| File                                   | Responsibility                                              |
| -------------------------------------- | ----------------------------------------------------------- |
| `apps/web/e2e/helpers/seed-data.ts`    | New — Deterministic UUIDs + constants for seeded entities   |
| `apps/web/e2e/setup-db.ts`             | Modify — Add seed data insertion after migrations           |
| `apps/web/e2e/global-setup.ts`         | Modify — Pass userId to seed function after registration    |
| `apps/web/e2e/helpers/api.ts`          | New — CRUD helpers for creating/deleting throwaway entities |
| `apps/web/playwright.config.ts`        | Modify — Add `testMatch` array for execution ordering       |
| `apps/web/e2e/stats.spec.ts`           | New — Stats page tests                                      |
| `apps/web/e2e/browse.spec.ts`          | New — Browse page tests                                     |
| `apps/web/e2e/deck-management.spec.ts` | New — Dashboard deck CRUD tests                             |
| `apps/web/e2e/note-types.spec.ts`      | New — Note type management tests                            |
| `apps/web/e2e/study-actions.spec.ts`   | New — Study keyboard/undo/suspend/bury tests                |
| `apps/web/e2e/settings.spec.ts`        | New — Settings page tests                                   |
| `apps/web/e2e/auth-edge-cases.spec.ts` | New — Auth error/guard tests                                |

---

### Task 1: Seed Data Constants

**Files:**

- Create: `apps/web/e2e/helpers/seed-data.ts`

- [ ] **Step 1: Create seed-data.ts with deterministic IDs**

```ts
// apps/web/e2e/helpers/seed-data.ts

/** Deterministic UUIDs and constants for seeded test data. */

// Fixed user ID — must match the user created during global setup.
// We'll extract this from the DB after registration.
export let SEED_USER_ID = "";

export function setSeedUserId(id: string): void {
  SEED_USER_ID = id;
}

export const SEED = {
  decks: {
    spanish: { id: "a0000000-0000-0000-0000-000000000001", name: "Spanish" },
    spanishVerbs: {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "Spanish::Verbs",
    },
    math: { id: "a0000000-0000-0000-0000-000000000003", name: "Math" },
    empty: { id: "a0000000-0000-0000-0000-000000000004", name: "Empty" },
  },
  noteTypes: {
    basic: {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "E2E Basic",
      fields: ["Front", "Back"],
    },
    cloze: {
      id: "b0000000-0000-0000-0000-000000000002",
      name: "E2E Cloze",
      fields: ["Text", "Extra"],
    },
  },
  templates: {
    basicCard1: { id: "c0000000-0000-0000-0000-000000000001" },
    clozeCard1: { id: "c0000000-0000-0000-0000-000000000002" },
  },
  notes: {
    spanishVerb1: {
      id: "d0000000-0000-0000-0000-000000000001",
      fields: { Front: "hablar", Back: "to speak" },
    },
    spanishVerb2: {
      id: "d0000000-0000-0000-0000-000000000002",
      fields: { Front: "comer", Back: "to eat" },
    },
    spanishVerb3: {
      id: "d0000000-0000-0000-0000-000000000003",
      fields: { Front: "vivir", Back: "to live" },
    },
    spanishVerb4: {
      id: "d0000000-0000-0000-0000-000000000004",
      fields: { Front: "dormir", Back: "to sleep" },
    },
    mathBasic: {
      id: "d0000000-0000-0000-0000-000000000005",
      fields: { Front: "2+2", Back: "4" },
    },
    mathCloze: {
      id: "d0000000-0000-0000-0000-000000000006",
      fields: {
        Text: "The {{c1::derivative}} of x^2 is 2x",
        Extra: "Calculus",
      },
    },
  },
  cards: {
    spanishVerb1: { id: "e0000000-0000-0000-0000-000000000001" },
    spanishVerb2: { id: "e0000000-0000-0000-0000-000000000002" },
    spanishVerb3: { id: "e0000000-0000-0000-0000-000000000003" },
    spanishVerb4: { id: "e0000000-0000-0000-0000-000000000004" },
    mathBasic: { id: "e0000000-0000-0000-0000-000000000005" },
    mathCloze: { id: "e0000000-0000-0000-0000-000000000006" },
  },
} as const;
```

- [ ] **Step 2: Commit**

```
git add apps/web/e2e/helpers/seed-data.ts
git commit -m "test: add deterministic seed data constants for e2e tests"
```

---

### Task 2: Seed Data Insertion in setup-db.ts

**Files:**

- Modify: `apps/web/e2e/setup-db.ts`

- [ ] **Step 1: Add seed insertion function to setup-db.ts**

The existing file applies migrations. Add a `seedData(dbPath, userId)` export that inserts baseline entities using raw Bun SQLite.

Add after the existing `migrate()` call:

```ts
export function seedData(dbPath: string, userId: string): void {
  const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
  const seedDb = new Database(dbPath);

  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;
  const twoDaysAgo = now - 172800;
  const threeDaysAgo = now - 259200;

  seedDb.exec(`
    INSERT OR IGNORE INTO decks (id, user_id, name, parent_id, description, settings, created_at, updated_at) VALUES
      ('a0000000-0000-0000-0000-000000000001', '${userId}', 'Spanish', NULL, '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now}),
      ('a0000000-0000-0000-0000-000000000002', '${userId}', 'Spanish::Verbs', 'a0000000-0000-0000-0000-000000000001', '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now}),
      ('a0000000-0000-0000-0000-000000000003', '${userId}', 'Math', NULL, '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now}),
      ('a0000000-0000-0000-0000-000000000004', '${userId}', 'Empty', NULL, '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now});

    INSERT OR IGNORE INTO note_types (id, user_id, name, fields, css, created_at, updated_at) VALUES
      ('b0000000-0000-0000-0000-000000000001', '${userId}', 'E2E Basic', '[{"name":"Front","ordinal":0},{"name":"Back","ordinal":1}]', '', ${now}, ${now}),
      ('b0000000-0000-0000-0000-000000000002', '${userId}', 'E2E Cloze', '[{"name":"Text","ordinal":0},{"name":"Extra","ordinal":1}]', '', ${now}, ${now});

    INSERT OR IGNORE INTO card_templates (id, note_type_id, name, ordinal, question_template, answer_template, updated_at) VALUES
      ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Card 1', 0, '{{Front}}', '{{FrontSide}}<hr>{{Back}}', ${now}),
      ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}', ${now});

    INSERT OR IGNORE INTO notes (id, user_id, note_type_id, fields, tags, created_at, updated_at) VALUES
      ('d0000000-0000-0000-0000-000000000001', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"hablar","Back":"to speak"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000002', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"comer","Back":"to eat"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000003', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"vivir","Back":"to live"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000004', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"dormir","Back":"to sleep"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000005', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"2+2","Back":"4"}', 'math', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000006', '${userId}', 'b0000000-0000-0000-0000-000000000002', '{"Text":"The {{c1::derivative}} of x^2 is 2x","Extra":"Calculus"}', 'math calculus', ${now}, ${now});

    INSERT OR IGNORE INTO cards (id, note_id, deck_id, template_id, ordinal, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, suspended, created_at, updated_at) VALUES
      ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${now}, 0, 0, 0, 0, 0, 0, 0, NULL, 0, ${now}, ${now}),
      ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${oneDayAgo}, 5.0, 5.5, 1, 5, 3, 0, 2, ${twoDaysAgo}, 0, ${threeDaysAgo}, ${oneDayAgo}),
      ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${oneDayAgo}, 4.0, 6.0, 2, 4, 2, 0, 2, ${twoDaysAgo}, 0, ${threeDaysAgo}, ${oneDayAgo}),
      ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${now}, 0, 0, 0, 0, 0, 0, 0, NULL, 0, ${now}, ${now}),
      ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 0, ${oneDayAgo}, 3.0, 5.0, 1, 3, 1, 0, 2, ${twoDaysAgo}, 0, ${threeDaysAgo}, ${oneDayAgo}),
      ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 0, ${now}, 0, 0, 0, 0, 0, 0, 0, NULL, 0, ${now}, ${now});

    INSERT OR IGNORE INTO review_logs (id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, reviewed_at, time_taken_ms) VALUES
      ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 3, 0, ${threeDaysAgo}, 0, 0, 0, 0, 0, ${threeDaysAgo}, 5000),
      ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 3, 0, ${threeDaysAgo}, 0, 0, 0, 0, 0, ${threeDaysAgo}, 4000),
      ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 3, 2, ${twoDaysAgo}, 3.0, 5.0, 1, 0, 3, ${twoDaysAgo}, 3000),
      ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 3, 0, ${twoDaysAgo}, 0, 0, 0, 0, 0, ${twoDaysAgo}, 6000),
      ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000003', 3, 2, ${oneDayAgo}, 4.0, 5.5, 1, 1, 4, ${oneDayAgo}, 3500);
  `);

  seedDb.close();
}
```

Note: The `seedData` function is exported separately so it can be called from `global-setup.ts` after the user is registered. The existing `migrate()` call at the top remains unchanged. Uses raw Bun SQLite since it runs via `bun --bun`.

- [ ] **Step 2: Verify seed script compiles**

Run: `cd apps/web && bun --bun run e2e/setup-db.ts sqlite-e2e.db`
Expected: No errors (seedData is not called from CLI, only migrate runs)

- [ ] **Step 3: Commit**

```
git add apps/web/e2e/setup-db.ts
git commit -m "test: add seed data insertion function to e2e setup script"
```

---

### Task 3: Global Setup + Config Changes

**Files:**

- Modify: `apps/web/e2e/global-setup.ts`
- Modify: `apps/web/playwright.config.ts`

- [ ] **Step 1: Update global-setup.ts to call seedData after registration**

After the storage state is saved (around line 99), add:

```ts
// Extract user ID from session for seeding
const sessionRes = await page.request.get(
  "http://localhost:3000/api/auth/get-session",
);
const sessionData = (await sessionRes.json()) as {
  user?: { id: string };
};
const userId = sessionData.user?.id;
if (!userId) {
  throw new Error("Failed to get user ID from session for seeding");
}

// Seed baseline test data
const { seedData } = await import("./setup-db");
seedData(E2E_DB, userId);
```

Add this after `await context.storageState(...)` and before `await browser.close()`.

- [ ] **Step 2: Update playwright.config.ts with testMatch ordering**

Add the `testMatch` array after `testDir`:

```ts
testDir: "./e2e",
testMatch: [
  "import-and-study.spec.ts",
  "template-preview.spec.ts",
  "stats.spec.ts",
  "browse.spec.ts",
  "deck-management.spec.ts",
  "note-types.spec.ts",
  "study-actions.spec.ts",
  "settings.spec.ts",
  "auth-edge-cases.spec.ts",
],
```

- [ ] **Step 3: Verify global setup runs successfully**

Run: `cd apps/web && npx playwright test --list`
Expected: Lists test files in specified order, no setup errors

- [ ] **Step 4: Commit**

```
git add apps/web/e2e/global-setup.ts apps/web/playwright.config.ts
git commit -m "test: wire up seed data in global setup and configure test ordering"
```

---

### Task 4: API Helpers

**Files:**

- Create: `apps/web/e2e/helpers/api.ts`

- [ ] **Step 1: Create API helper functions**

```ts
// apps/web/e2e/helpers/api.ts
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function createDeck(
  page: Page,
  data: { name: string; parentId?: string },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/decks", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

export async function deleteDeck(page: Page, deckId: string): Promise<void> {
  const res = await page.request.delete(`/api/decks/${deckId}`);
  expect(res.status()).toBe(204);
}

export async function createNoteType(
  page: Page,
  data: { name: string; fields: string[]; css?: string },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/note-types", {
    data: {
      name: data.name,
      fields: data.fields.map((f, i) => ({ name: f, ordinal: i })),
      css: data.css ?? "",
    },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

export async function deleteNoteType(
  page: Page,
  noteTypeId: string,
): Promise<void> {
  const res = await page.request.delete(`/api/note-types/${noteTypeId}`);
  expect(res.status()).toBe(204);
}

export async function createNote(
  page: Page,
  data: { noteTypeId: string; deckId: string; fields: Record<string, string> },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/notes", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

export async function deleteNote(page: Page, noteId: string): Promise<void> {
  const res = await page.request.delete(`/api/notes/${noteId}`);
  expect(res.status()).toBe(204);
}

export async function createTemplate(
  page: Page,
  data: {
    noteTypeId: string;
    name: string;
    questionTemplate: string;
    answerTemplate: string;
  },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/note-types/templates", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}
```

- [ ] **Step 2: Commit**

```
git add apps/web/e2e/helpers/api.ts
git commit -m "test: add API helper functions for e2e test data management"
```

---

### Task 5: stats.spec.ts

**Files:**

- Create: `apps/web/e2e/stats.spec.ts`

- [ ] **Step 1: Write stats spec**

```ts
// apps/web/e2e/stats.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Statistics page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/stats", { waitUntil: "networkidle" });
  });

  test("streak display renders", async ({ page }) => {
    await expect(page.getByText("Streak")).toBeVisible();
    await expect(page.getByText(/days? current/i)).toBeVisible();
    await expect(page.getByText(/days? longest/i)).toBeVisible();
  });

  test("reviews per day chart renders", async ({ page }) => {
    await expect(page.getByText("Reviews per Day")).toBeVisible();
    await expect(page.locator(".recharts-responsive-container")).toBeVisible();
  });

  test("period selector switches data", async ({ page }) => {
    const btn7 = page.getByRole("button", { name: "7 days" });
    const btn30 = page.getByRole("button", { name: "30 days" });
    const btn90 = page.getByRole("button", { name: "90 days" });
    const btnYear = page.getByRole("button", { name: "Year" });

    await expect(btn7).toBeVisible();
    await expect(btn30).toBeVisible();
    await expect(btn90).toBeVisible();
    await expect(btnYear).toBeVisible();

    await btn30.click();
    await expect(page.locator(".recharts-responsive-container")).toBeVisible();

    await btnYear.click();
    await expect(page.locator(".recharts-responsive-container")).toBeVisible();
  });

  test("card states chart renders with legend", async ({ page }) => {
    await expect(page.getByText("Card States")).toBeVisible();
    await expect(page.getByText(/total cards?/i)).toBeVisible();
  });

  test("heatmap renders current year", async ({ page }) => {
    const currentYear = new Date().getFullYear().toString();
    await expect(page.getByText(currentYear)).toBeVisible();
    await expect(
      page.locator('[class*="size-\\[13px\\]"]').first(),
    ).toBeVisible();
  });

  test("heatmap year navigation", async ({ page }) => {
    const currentYear = new Date().getFullYear();
    const prevBtn = page.getByRole("button", { name: "Previous" });
    const nextBtn = page.getByRole("button", { name: "Next" });

    await expect(nextBtn).toBeDisabled();

    await prevBtn.click();
    await expect(page.getByText(String(currentYear - 1))).toBeVisible();
    await expect(nextBtn).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test stats.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/stats.spec.ts
git commit -m "test: add e2e tests for statistics page"
```

---

### Task 6: browse.spec.ts

**Files:**

- Create: `apps/web/e2e/browse.spec.ts`

- [ ] **Step 1: Write browse spec**

```ts
// apps/web/e2e/browse.spec.ts
import { test, expect } from "@playwright/test";
import { createDeck, createNote } from "./helpers/api";
import { SEED } from "./helpers/seed-data";

test.describe("Browse page", () => {
  test("page loads with seeded notes", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("hablar")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("comer")).toBeVisible();
  });

  test("free-text search filters results", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    const searchInput = page.getByPlaceholder(/Search notes/);
    await searchInput.fill("hablar");
    await searchInput.press("Enter");

    await expect(page.getByText("hablar")).toBeVisible();
    await expect(page.getByText("comer")).not.toBeVisible();
  });

  test("filter by deck", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("hablar")).toBeVisible({ timeout: 10_000 });

    await page.getByText("All Decks").click();
    await page.getByRole("option", { name: "Math" }).click();

    await expect(page.getByText("2+2")).toBeVisible();
    await expect(page.getByText("hablar")).not.toBeVisible();
  });

  test("state toggle buttons filter results", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("hablar")).toBeVisible({ timeout: 10_000 });

    const newBtn = page.getByRole("button", { name: /^new$/i });
    await newBtn.click();

    const searchInput = page.getByPlaceholder(/Search notes/);
    await expect(searchInput).toHaveValue(/is:new/);
  });

  test("empty results shows message", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    const searchInput = page.getByPlaceholder(/Search notes/);
    await searchInput.fill("xyznonexistent123");
    await searchInput.press("Enter");

    await expect(page.getByText(/No notes found/)).toBeVisible();
  });
});

test.describe("Browse note editing", () => {
  test.describe.configure({ mode: "serial" });

  let throwawayDeckId: string;

  test("setup: create throwaway note", async ({ page }) => {
    const deck = await createDeck(page, { name: "BrowseTestDeck" });
    throwawayDeckId = deck.id;

    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId: deck.id,
      fields: { Front: "BrowseTestFront", Back: "BrowseTestBack" },
    });
  });

  test("click note opens editor", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("BrowseTestFront")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("BrowseTestFront").click();

    await expect(page.getByText("Edit Note")).toBeVisible();
    await expect(page.getByDisplayValue("BrowseTestFront")).toBeVisible();
  });

  test("edit note fields and save", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("BrowseTestFront")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("BrowseTestFront").click();
    await expect(page.getByText("Edit Note")).toBeVisible();

    const frontInput = page.getByDisplayValue("BrowseTestFront");
    await frontInput.clear();
    await frontInput.fill("BrowseTestEdited");

    await page.getByRole("button", { name: /Save Changes/i }).click();

    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("BrowseTestEdited")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("suspend note from editor", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("BrowseTestEdited")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("BrowseTestEdited").click();
    await expect(page.getByText("Edit Note")).toBeVisible();

    await page.getByRole("button", { name: /Suspend Note/i }).click();
    await page.waitForTimeout(500);

    await page.keyboard.press("Escape");
    await expect(page.getByText("Suspended").first()).toBeVisible();
  });

  test("unsuspend note from editor", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("BrowseTestEdited")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("BrowseTestEdited").click();
    await expect(page.getByText("Edit Note")).toBeVisible();

    await page.getByRole("button", { name: /Unsuspend Note/i }).click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
  });

  test("delete note from editor", async ({ page }) => {
    await page.goto("/browse", { waitUntil: "networkidle" });
    await expect(page.getByText("BrowseTestEdited")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("BrowseTestEdited").click();
    await expect(page.getByText("Edit Note")).toBeVisible();

    await page.getByRole("button", { name: /Delete Note/i }).click();

    await page
      .getByRole("button", { name: /Delete/i })
      .filter({ hasNotText: /Note/ })
      .click();

    await expect(page.getByText("BrowseTestEdited")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test browse.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/browse.spec.ts
git commit -m "test: add e2e tests for browse page"
```

---

### Task 7: deck-management.spec.ts

**Files:**

- Create: `apps/web/e2e/deck-management.spec.ts`

- [ ] **Step 1: Write deck management spec**

```ts
// apps/web/e2e/deck-management.spec.ts
import { test, expect } from "@playwright/test";
import { createDeck } from "./helpers/api";

test.describe("Deck management", () => {
  test("seeded decks are visible on dashboard", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Spanish", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Math", { exact: true })).toBeVisible();
    await expect(page.getByText("Empty", { exact: true })).toBeVisible();
  });

  test("nested deck visible under parent", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Spanish", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Verbs").first()).toBeVisible();
  });

  test("click deck navigates to study", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("Math", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("link", { name: "Math" }).click();
    await page.waitForURL("**/study/**", { timeout: 10_000 });
    expect(page.url()).toContain("/study/");
  });
});

test.describe("Deck CRUD", () => {
  test.describe.configure({ mode: "serial" });

  test("create deck via dialog", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /Add Deck/i }).click();

    const nameInput = page.getByPlaceholder("Deck name");
    await nameInput.fill("E2E Test Deck");
    await page.getByRole("button", { name: /Create Deck/i }).click();

    await expect(page.getByText("E2E Test Deck")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("rename deck via settings dialog", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E Test Deck")).toBeVisible({
      timeout: 15_000,
    });

    // Open action menu for the deck
    const deckRow = page
      .locator("[class*='group']")
      .filter({ hasText: "E2E Test Deck" });
    await deckRow
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();

    await page.getByRole("menuitem", { name: /Options/i }).click();

    const nameInput = page.locator("#opt-name");
    await nameInput.clear();
    await nameInput.fill("E2E Renamed Deck");
    await page.getByRole("button", { name: /Save/i }).click();

    await expect(page.getByText("E2E Renamed Deck")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("delete deck with confirmation", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E Renamed Deck")).toBeVisible({
      timeout: 15_000,
    });

    const deckRow = page
      .locator("[class*='group']")
      .filter({ hasText: "E2E Renamed Deck" });
    await deckRow
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();

    await page.getByRole("menuitem", { name: /Delete/i }).click();

    await expect(page.getByText("Delete Deck")).toBeVisible();
    await page
      .getByRole("button", { name: /Delete/i })
      .last()
      .click();

    await expect(page.getByText("E2E Renamed Deck")).not.toBeVisible();
  });

  test("delete parent deck re-parents children", async ({ page }) => {
    const parent = await createDeck(page, { name: "ParentToDelete" });
    await createDeck(page, { name: "ChildDeck", parentId: parent.id });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText("ParentToDelete")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("ChildDeck")).toBeVisible();

    const parentRow = page
      .locator("[class*='group']")
      .filter({ hasText: "ParentToDelete" });
    await parentRow
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .last()
      .click();
    await page.getByRole("menuitem", { name: /Delete/i }).click();
    await page
      .getByRole("button", { name: /Delete/i })
      .last()
      .click();

    await expect(page.getByText("ParentToDelete")).not.toBeVisible();
    await expect(page.getByText("ChildDeck")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test deck-management.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/deck-management.spec.ts
git commit -m "test: add e2e tests for deck management"
```

---

### Task 8: note-types.spec.ts

**Files:**

- Create: `apps/web/e2e/note-types.spec.ts`

- [ ] **Step 1: Write note types spec**

```ts
// apps/web/e2e/note-types.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Note types page", () => {
  test("page shows seeded note types", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });

    await expect(page.getByText("E2E Basic", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("E2E Cloze", { exact: true })).toBeVisible();
    await expect(page.getByText("2 fields").first()).toBeVisible();
  });

  test("delete note type with notes fails", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E Basic", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const basicCard = page.locator(".group").filter({ hasText: "E2E Basic" });
    await basicCard
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();

    await page
      .getByRole("button", { name: /Delete/i })
      .last()
      .click();

    await expect(page.getByText(/cannot delete|referenced/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Note type CRUD", () => {
  test.describe.configure({ mode: "serial" });

  let createdNoteTypeName: string;

  test("create note type", async ({ page }) => {
    createdNoteTypeName = "E2E TestType";
    await page.goto("/note-types", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /New Note Type/i }).click();

    await page.locator("#note-type-name").fill(createdNoteTypeName);
    await page.locator("#note-type-fields").clear();
    await page.locator("#note-type-fields").fill("Question, Answer, Hint");

    await page.getByRole("button", { name: /Create/i }).click();

    await expect(page.getByText(createdNoteTypeName)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("3 fields")).toBeVisible();
  });

  test("edit note type name", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });
    await expect(page.getByText(createdNoteTypeName)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel(`Edit ${createdNoteTypeName}`).click();
    await expect(
      page.getByText("Edit fields, templates, and styling"),
    ).toBeVisible();

    const nameInput = page.getByLabel("Note Type Name");
    await nameInput.clear();
    await nameInput.fill("E2E Renamed Type");
    await page.getByRole("button", { name: /Save/i }).first().click();

    createdNoteTypeName = "E2E Renamed Type";

    await page.keyboard.press("Escape");
    await expect(page.getByText(createdNoteTypeName)).toBeVisible();
  });

  test("add field to note type", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });
    await expect(page.getByText(createdNoteTypeName)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByLabel(`Edit ${createdNoteTypeName}`).click();

    await page.getByRole("tab", { name: "Fields" }).click();

    const addInput = page.getByPlaceholder(/field name/i);
    await addInput.fill("Source");
    await page.getByRole("button", { name: /Add/i }).click();

    await page.getByRole("button", { name: /Save Fields/i }).click();

    await page.keyboard.press("Escape");
    await expect(page.getByText("4 fields")).toBeVisible();
  });

  test("delete note type without notes succeeds", async ({ page }) => {
    await page.goto("/note-types", { waitUntil: "networkidle" });
    await expect(page.getByText(createdNoteTypeName)).toBeVisible({
      timeout: 10_000,
    });

    const card = page
      .locator(".group")
      .filter({ hasText: createdNoteTypeName });
    await card
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();

    await page
      .getByRole("button", { name: /Delete/i })
      .last()
      .click();

    await expect(page.getByText(createdNoteTypeName)).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test note-types.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/note-types.spec.ts
git commit -m "test: add e2e tests for note type management"
```

---

### Task 9: study-actions.spec.ts

**Files:**

- Create: `apps/web/e2e/study-actions.spec.ts`

- [ ] **Step 1: Write study actions spec**

```ts
// apps/web/e2e/study-actions.spec.ts
import { test, expect } from "@playwright/test";
import { createDeck, createNote } from "./helpers/api";
import { SEED } from "./helpers/seed-data";

test.describe("Study actions", () => {
  test.describe.configure({ mode: "serial" });

  let studyDeckId: string;

  test("setup: create deck with notes for study", async ({ page }) => {
    const deck = await createDeck(page, { name: "StudyActionsTest" });
    studyDeckId = deck.id;

    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId: deck.id,
      fields: { Front: "StudyQ1", Back: "StudyA1" },
    });
    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId: deck.id,
      fields: { Front: "StudyQ2", Back: "StudyA2" },
    });
    await createNote(page, {
      noteTypeId: SEED.noteTypes.basic.id,
      deckId: deck.id,
      fields: { Front: "StudyQ3", Back: "StudyA3" },
    });
  });

  test("study page loads with progress counters", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });

    await expect(
      page.locator(".prose").or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible();
  });

  test("Space shows answer and rating buttons", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Space");

    await expect(page.getByRole("button", { name: /Again/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Good/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Easy/i })).toBeVisible();
  });

  test("rating buttons show interval previews", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Space");

    const goodBtn = page.getByRole("button", { name: /Good/i });
    await expect(goodBtn).toBeVisible();
    const btnText = await goodBtn.textContent();
    expect(btnText).toMatch(/Good.*\d/);
  });

  test("keyboard rating advances to next card", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /Good/i })).toBeVisible();
    await page.keyboard.press("3");

    await page.waitForTimeout(1000);
    await expect(
      page
        .getByRole("button", { name: /Show Answer/i })
        .or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("undo review with Z key", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Space");
    await page.keyboard.press("3");
    await page.waitForTimeout(1000);

    const undoBtn = page.getByRole("button", { name: /Undo/i });
    await expect(undoBtn).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("z");
    await page.waitForTimeout(1000);

    await expect(undoBtn).not.toBeVisible();
  });

  test("suspend card from menu", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Open three-dot menu — find the dropdown trigger button
    const dropdownTrigger = page.locator(
      'button:has(svg[class*="more"]), button:has(svg[class*="ellipsis"])',
    );
    await dropdownTrigger.first().click();

    await page.getByRole("menuitem", { name: /Suspend Card/i }).click();

    await page.waitForTimeout(1000);
    await expect(
      page
        .getByRole("button", { name: /Show Answer/i })
        .or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("bury card from menu", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: /Show Answer/i }),
    ).toBeVisible({ timeout: 15_000 });

    const dropdownTrigger = page.locator(
      'button:has(svg[class*="more"]), button:has(svg[class*="ellipsis"])',
    );
    await dropdownTrigger.first().click();

    await page.getByRole("menuitem", { name: /Bury Card/i }).click();

    await page.waitForTimeout(1000);
    await expect(
      page
        .getByRole("button", { name: /Show Answer/i })
        .or(page.getByText("Congratulations!")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("congrats screen after all cards reviewed", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });

    for (let i = 0; i < 10; i++) {
      const showAnswer = page.getByRole("button", { name: /Show Answer/i });
      const congrats = page.getByText("Congratulations!");

      if (await congrats.isVisible().catch(() => false)) break;
      if (!(await showAnswer.isVisible().catch(() => false))) break;

      await showAnswer.click();
      await page.waitForTimeout(300);
      await page.keyboard.press("3");
      await page.waitForTimeout(1000);
    }

    await expect(page.getByText("Congratulations!")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/reviewed/i)).toBeVisible();
  });

  test("congrats back to dashboard button works", async ({ page }) => {
    await page.goto(`/study/${studyDeckId}`, { waitUntil: "networkidle" });

    await expect(page.getByText("Congratulations!")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Back to Dashboard/i }).click();
    await page.waitForURL("**/", { timeout: 10_000 });
  });

  test("empty deck shows congrats immediately", async ({ page }) => {
    await page.goto(`/study/${SEED.decks.empty.id}`, {
      waitUntil: "networkidle",
    });

    await expect(page.getByText("Congratulations!")).toBeVisible({
      timeout: 15_000,
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test study-actions.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/study-actions.spec.ts
git commit -m "test: add e2e tests for study actions (keyboard, undo, suspend)"
```

---

### Task 10: settings.spec.ts

**Files:**

- Create: `apps/web/e2e/settings.spec.ts`

- [ ] **Step 1: Write settings spec**

```ts
// apps/web/e2e/settings.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });
  });

  test("profile section loads with user data", async ({ page }) => {
    const nameInput = page.locator("#display-name");
    await expect(nameInput).toBeVisible();
    const value = await nameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);

    const emailInput = page.locator("#email");
    await expect(emailInput).toBeDisabled();
    await expect(page.getByText("Email cannot be changed")).toBeVisible();
  });

  test("update display name", async ({ page }) => {
    const nameInput = page.locator("#display-name");
    await nameInput.clear();
    await nameInput.fill("E2E Updated Name");

    await page.getByRole("button", { name: /Save/i }).first().click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5_000 });

    // Restore original
    await nameInput.clear();
    await nameInput.fill("E2E Test");
    await page.getByRole("button", { name: /Save/i }).first().click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5_000 });
  });

  test("save button disabled when name unchanged", async ({ page }) => {
    const saveBtn = page.getByRole("button", { name: /Save/i }).first();
    await expect(saveBtn).toBeDisabled();
  });

  test("theme: dark mode applies", async ({ page }) => {
    await page.getByText("Dark", { exact: true }).click();
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");
  });

  test("theme: light mode applies", async ({ page }) => {
    await page.getByText("Light", { exact: true }).click();
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).not.toContain("dark");
  });

  test("theme: system mode selectable", async ({ page }) => {
    await page.getByText("System", { exact: true }).click();
    const systemOption = page.locator("label").filter({ hasText: "System" });
    await expect(systemOption).toBeVisible();
  });

  test("change password: too short", async ({ page }) => {
    await page.locator("#current-password").fill("TestPass123!");
    await page.locator("#new-password").fill("short");
    await page.locator("#confirm-password").fill("short");

    await page.getByRole("button", { name: /Change Password/i }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("change password: mismatch", async ({ page }) => {
    await page.locator("#current-password").fill("TestPass123!");
    await page.locator("#new-password").fill("NewPassword123!");
    await page.locator("#confirm-password").fill("DifferentPassword!");

    await page.getByRole("button", { name: /Change Password/i }).click();
    await expect(page.getByText(/do not match/i)).toBeVisible();
  });

  test("change password: success and restore", async ({ page }) => {
    await page.locator("#current-password").fill("TestPass123!");
    await page.locator("#new-password").fill("NewE2EPass456!");
    await page.locator("#confirm-password").fill("NewE2EPass456!");

    await page.getByRole("button", { name: /Change Password/i }).click();
    await expect(page.getByText(/password.*changed|success/i)).toBeVisible({
      timeout: 5_000,
    });

    // Restore original password
    await page.locator("#current-password").fill("NewE2EPass456!");
    await page.locator("#new-password").fill("TestPass123!");
    await page.locator("#confirm-password").fill("TestPass123!");
    await page.getByRole("button", { name: /Change Password/i }).click();
    await expect(page.getByText(/password.*changed|success/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test settings.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/settings.spec.ts
git commit -m "test: add e2e tests for settings page"
```

---

### Task 11: auth-edge-cases.spec.ts

**Files:**

- Create: `apps/web/e2e/auth-edge-cases.spec.ts`

- [ ] **Step 1: Write auth edge cases spec**

```ts
// apps/web/e2e/auth-edge-cases.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Auth edge cases", () => {
  test.describe.configure({ mode: "serial" });

  test("unauthenticated access redirects to login", async ({ browser }) => {
    // Create a fresh context WITHOUT storage state (no auth cookies)
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3000/browse");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");

    await context.close();
  });

  test("login with wrong password shows error", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3000/login", {
      waitUntil: "networkidle",
    });

    await page.getByLabel("Email").fill("e2e@test.com");
    await page.getByLabel("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: /Sign in/i }).click();

    await expect(page.getByText(/invalid|incorrect|wrong|failed/i)).toBeVisible(
      { timeout: 10_000 },
    );

    await context.close();
  });

  test("register with duplicate email shows error", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3000/register", {
      waitUntil: "networkidle",
    });

    await page.getByLabel("Name").fill("Duplicate User");
    await page.getByLabel("Email").fill("e2e@test.com");
    await page.getByLabel("Password").fill("TestPass123!");
    await page.getByRole("button", { name: /Create account/i }).click();

    await expect(page.getByText(/already|exists|taken/i)).toBeVisible({
      timeout: 10_000,
    });

    await context.close();
  });

  test("delete account modal requires exact DELETE text", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /Delete Account/i }).click();
    await expect(page.getByText("Delete Account")).toBeVisible();

    const confirmBtn = page.getByRole("button", {
      name: /Permanently Delete Account/i,
    });
    await expect(confirmBtn).toBeDisabled();

    const input = page.locator("#confirm-delete");
    await input.fill("delete");
    await expect(confirmBtn).toBeDisabled();

    await input.clear();
    await input.fill("DELETE");
    await expect(confirmBtn).toBeEnabled();

    // Close without deleting
    await page.keyboard.press("Escape");
  });

  test("sign out redirects to login (LAST TEST)", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: /Sign Out/i }).click();

    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/web && npx playwright test auth-edge-cases.spec.ts`
Expected: All tests pass

- [ ] **Step 3: Fix any test failures and commit**

```
git add apps/web/e2e/auth-edge-cases.spec.ts
git commit -m "test: add e2e tests for auth edge cases"
```

---

### Task 12: Full Suite Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the complete test suite**

Run: `cd apps/web && npx playwright test`
Expected: All tests pass across all 9 spec files in order

- [ ] **Step 2: Fix any cross-spec issues**

If any tests fail due to state pollution from other specs, adjust setup/teardown.

- [ ] **Step 3: Run tests a second time to verify idempotency**

Run: `cd apps/web && npx playwright test`
Expected: All tests pass again (seed data uses INSERT OR IGNORE, throwaway entities are re-created)

- [ ] **Step 4: Final commit if any fixes were needed**

```
git add -u
git commit -m "test: fix cross-spec issues in e2e test suite"
```
