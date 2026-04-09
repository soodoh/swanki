# Vitest Browser Mode Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Vitest browser mode with Playwright provider for component testing, remove unused testing deps, and ship 3 initial component tests.

**Architecture:** Vitest workspace with two projects — `unit` (node env, `*.test.ts`) and `browser` (Playwright chromium, `*.test.tsx`). Existing unit tests are untouched. New component tests are colocated next to their components.

**Tech Stack:** Vitest 4.1.0, `@vitest/browser`, `playwright`, React 19, Tailwind CSS v4, base-ui components.

**Spec:** `docs/superpowers/specs/2026-04-09-vitest-browser-mode-design.md`

---

### Task 1: Remove unused testing dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Remove the 3 unused deps**

```bash
cd apps/web && bun remove @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Verify nothing breaks**

```bash
cd apps/web && bun --bun vitest run
```

Expected: All 24 unit tests pass. These deps had zero imports.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "chore: remove unused testing-library and jsdom dependencies"
```

---

### Task 2: Add browser mode dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install @vitest/browser, playwright, and vitest-browser-react**

```bash
cd apps/web && bun add -d @vitest/browser playwright vitest-browser-react
```

Notes:
- `playwright` (browser engines for Vitest) is separate from `@playwright/test` (E2E framework, already installed). Both coexist fine.
- `vitest-browser-react` provides the `render()` function for mounting React components in browser mode tests. It's a separate package from `@vitest/browser`.

- [ ] **Step 2: Install Playwright browser binaries**

```bash
bunx playwright install chromium
```

This downloads the Chromium binary that Vitest browser mode will launch. If Chromium is already installed from `@playwright/test`, this is a no-op.

- [ ] **Step 3: Verify unit tests still pass**

```bash
cd apps/web && bun --bun vitest run
```

Expected: All 24 unit tests pass. No behavior change yet.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "chore: add @vitest/browser and playwright for browser mode"
```

---

### Task 3: Replace vitest config with workspace

**Files:**
- Delete: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.workspace.ts`

- [ ] **Step 1: Create the workspace file**

Create `apps/web/vitest.workspace.ts`:

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

Key details:
- The `unit` project is identical to the old `vitest.config.ts` — same env, includes, globals.
- The `browser` project matches `*.test.tsx` files and runs them in real Chromium.
- Both share the `vite-tsconfig-paths` plugin so `@/*` path aliases work.

- [ ] **Step 2: Delete the old config**

```bash
rm apps/web/vitest.config.ts
```

- [ ] **Step 3: Run unit tests to verify no regression**

```bash
cd apps/web && bun --bun vitest run
```

Expected: All 24 unit tests pass in the `unit` project. The `browser` project finds no `*.test.tsx` files yet — that's fine, it should report 0 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/web/vitest.workspace.ts
git rm apps/web/vitest.config.ts
git commit -m "feat: replace vitest config with workspace for unit + browser projects"
```

---

### Task 4: Write RatingButtons component test

**Files:**
- Create: `apps/web/src/components/study/rating-buttons.test.tsx`
- Reference: `apps/web/src/components/study/rating-buttons.tsx`

This component is pure presentation — no hooks, no context. It takes `previews`, `disabled`, and `onRate` props. It renders 4 buttons (Again, Hard, Good, Easy) with optional interval previews.

- [ ] **Step 1: Write the test file**

Create `apps/web/src/components/study/rating-buttons.test.tsx`:

```tsx
import { render } from "vitest-browser-react";
import { describe, expect, it, vi } from "vitest";
import { RatingButtons } from "./rating-buttons";

describe("RatingButtons", () => {
	it("renders all four rating buttons with labels", async () => {
		const screen = render(
			<RatingButtons previews={undefined} disabled={false} onRate={() => {}} />
		);

		await expect.element(screen.getByText("Again")).toBeVisible();
		await expect.element(screen.getByText("Hard")).toBeVisible();
		await expect.element(screen.getByText("Good")).toBeVisible();
		await expect.element(screen.getByText("Easy")).toBeVisible();
	});

	it("displays formatted interval previews", async () => {
		const previews = {
			1: { rating: 1, due: "2026-01-01", stability: 0, difficulty: 0, scheduledDays: 0.00694 }, // ~10 minutes
			2: { rating: 2, due: "2026-01-01", stability: 0, difficulty: 0, scheduledDays: 0.125 },   // 3 hours
			3: { rating: 3, due: "2026-01-01", stability: 0, difficulty: 0, scheduledDays: 4 },        // 4 days
			4: { rating: 4, due: "2026-01-01", stability: 0, difficulty: 0, scheduledDays: 45 },       // ~1.5 months
		};

		const screen = render(
			<RatingButtons previews={previews} disabled={false} onRate={() => {}} />
		);

		await expect.element(screen.getByText("10m")).toBeVisible();
		await expect.element(screen.getByText("3h")).toBeVisible();
		await expect.element(screen.getByText("4d")).toBeVisible();
		await expect.element(screen.getByText("2mo")).toBeVisible();
	});

	it("fires onRate with the correct rating value on click", async () => {
		const onRate = vi.fn();

		const screen = render(
			<RatingButtons previews={undefined} disabled={false} onRate={onRate} />
		);

		await screen.getByText("Good").click();
		expect(onRate).toHaveBeenCalledWith(3);

		await screen.getByText("Again").click();
		expect(onRate).toHaveBeenCalledWith(1);
	});

	it("disables buttons when disabled prop is true", async () => {
		const onRate = vi.fn();

		const screen = render(
			<RatingButtons previews={undefined} disabled={true} onRate={onRate} />
		);

		// All buttons should have the disabled attribute
		const buttons = screen.getByRole("button");
		const allButtons = buttons.all();
		for (const button of allButtons) {
			await expect.element(button).toBeDisabled();
		}
	});
});
```

Notes for the implementer:
- `vitest-browser-react` is the rendering package for React in Vitest browser mode. It's provided by `@vitest/browser` and ships as a separate import.
- `render()` returns a screen-like object with Playwright locators (`getByText`, `getByRole`, etc.).
- Assertions use `await expect.element(locator)` — this is Vitest browser mode's async assertion API.
- The `IntervalPreview` type from the component has these fields: `rating`, `due`, `stability`, `difficulty`, `scheduledDays`. Only `scheduledDays` is used by `formatInterval()`.

- [ ] **Step 2: Run the test**

```bash
cd apps/web && bun --bun vitest run --project browser
```

Expected: 4 tests pass. Chromium launches headlessly, renders the component, runs assertions.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/study/rating-buttons.test.tsx
git commit -m "test: add RatingButtons component test with vitest browser mode"
```

---

### Task 5: Write StudyProgress component test

**Files:**
- Create: `apps/web/src/components/study/study-progress.test.tsx`
- Reference: `apps/web/src/components/study/study-progress.tsx`

This component takes `counts` (`{ new, learning, review }`) and `initialTotal`. It calculates a progress percentage and renders colored count dots plus a progress bar.

- [ ] **Step 1: Write the test file**

Create `apps/web/src/components/study/study-progress.test.tsx`:

```tsx
import { render } from "vitest-browser-react";
import { describe, expect, it } from "vitest";
import { StudyProgress } from "./study-progress";

describe("StudyProgress", () => {
	it("renders card counts for new, learning, and review", async () => {
		const screen = render(
			<StudyProgress
				counts={{ new: 5, learning: 3, review: 12 }}
				initialTotal={30}
			/>
		);

		await expect.element(screen.getByText("5")).toBeVisible();
		await expect.element(screen.getByText("3")).toBeVisible();
		await expect.element(screen.getByText("12")).toBeVisible();
	});

	it("calculates progress bar width correctly", async () => {
		// 30 total, 20 remaining (5+3+12) = 10 done = 33%
		const { container } = render(
			<StudyProgress
				counts={{ new: 5, learning: 3, review: 12 }}
				initialTotal={30}
			/>
		);

		const progressBar = container.querySelector("[style*='width']");
		await expect.element(progressBar!).toHaveAttribute("style", "width: 33%;");
	});

	it("shows 0% progress when all cards remain", async () => {
		const { container } = render(
			<StudyProgress
				counts={{ new: 10, learning: 0, review: 0 }}
				initialTotal={10}
			/>
		);

		const progressBar = container.querySelector("[style*='width']");
		await expect.element(progressBar!).toHaveAttribute("style", "width: 0%;");
	});

	it("handles zero initialTotal without division error", async () => {
		const { container } = render(
			<StudyProgress
				counts={{ new: 0, learning: 0, review: 0 }}
				initialTotal={0}
			/>
		);

		const progressBar = container.querySelector("[style*='width']");
		await expect.element(progressBar!).toHaveAttribute("style", "width: 0%;");
	});
});
```

Notes for the implementer:
- The progress formula is: `Math.round(((total - remaining) / total) * 100)` where `remaining = new + learning + review` and `total = initialTotal > 0 ? initialTotal : remaining`.
- The progress bar div has `style={{ width: \`${progress}%\` }}` — we assert on this attribute.
- `container` gives direct DOM access for CSS selector queries when locators aren't sufficient.

- [ ] **Step 2: Run the test**

```bash
cd apps/web && bun --bun vitest run --project browser
```

Expected: All browser tests pass (RatingButtons + StudyProgress = 8 tests total).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/study/study-progress.test.tsx
git commit -m "test: add StudyProgress component test with vitest browser mode"
```

---

### Task 6: Write SearchBar component test

**Files:**
- Create: `apps/web/src/components/browse/search-bar.test.tsx`
- Reference: `apps/web/src/components/browse/search-bar.tsx`

This component has local state (`localValue`), syncs with an external `value` prop via `useEffect`, handles keyboard events (Enter submits), and renders an Input, a Search button, and a help Tooltip. It uses `@/components/ui/input`, `@/components/ui/button`, and `@/components/ui/tooltip` — all based on `@base-ui/react` primitives.

- [ ] **Step 1: Write the test file**

Create `apps/web/src/components/browse/search-bar.test.tsx`:

```tsx
import { render } from "vitest-browser-react";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "./search-bar";

describe("SearchBar", () => {
	it("renders with the initial value", async () => {
		const screen = render(
			<SearchBar value="deck:Spanish" onChange={() => {}} onSubmit={() => {}} />
		);

		const input = screen.getByPlaceholderText("Search notes");
		await expect.element(input).toHaveValue("deck:Spanish");
	});

	it("typing updates input and fires onChange", async () => {
		const onChange = vi.fn();

		const screen = render(
			<SearchBar value="" onChange={onChange} onSubmit={() => {}} />
		);

		const input = screen.getByPlaceholderText("Search notes");
		await input.fill("hello");

		await expect.element(input).toHaveValue("hello");
		expect(onChange).toHaveBeenCalled();
	});

	it("pressing Enter fires onSubmit with current value", async () => {
		const onSubmit = vi.fn();

		const screen = render(
			<SearchBar value="" onChange={() => {}} onSubmit={onSubmit} />
		);

		const input = screen.getByPlaceholderText("Search notes");
		await input.fill("tag:verb");
		await input.press("Enter");

		expect(onSubmit).toHaveBeenCalledWith("tag:verb");
	});

	it("clicking Search button fires onSubmit", async () => {
		const onSubmit = vi.fn();

		const screen = render(
			<SearchBar value="is:new" onChange={() => {}} onSubmit={onSubmit} />
		);

		await screen.getByRole("button", { name: "Search" }).click();
		expect(onSubmit).toHaveBeenCalledWith("is:new");
	});

	it("syncs when external value prop changes", async () => {
		const onChange = vi.fn();

		const result = render(
			<SearchBar value="old" onChange={onChange} onSubmit={() => {}} />
		);

		const input = result.getByPlaceholderText("Search notes");
		await expect.element(input).toHaveValue("old");

		result.rerender(
			<SearchBar value="new-value" onChange={onChange} onSubmit={() => {}} />
		);

		await expect.element(input).toHaveValue("new-value");
	});
});
```

Notes for the implementer:
- The placeholder text is `"Search notes... (e.g., deck:Japanese tag:verb is:new)"`. The locator `getByPlaceholderText("Search notes")` uses substring matching.
- `fill()` replaces the input value (Playwright API). This triggers the component's `handleChange` which calls `onChange`.
- `press("Enter")` triggers the `handleKeyDown` which calls `onSubmit(localValue)`.
- `rerender()` updates props on the same component instance — tests the `useEffect` sync.
- The Search button is a `<Button>` with text content "Search" — located via `getByRole("button", { name: "Search" })`.

- [ ] **Step 2: Run all tests (unit + browser)**

```bash
cd apps/web && bun --bun vitest run
```

Expected: Both projects pass — 24 unit tests + 13 browser tests = 37 total.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/browse/search-bar.test.tsx
git commit -m "test: add SearchBar component test with vitest browser mode"
```

---

### Task 7: Final verification and cleanup

**Files:**
- Check: `apps/web/package.json` (verify final dep state)

- [ ] **Step 1: Run the full test suite**

```bash
cd apps/web && bun --bun vitest run
```

Expected output should show two projects:
```
 ✓ |unit| 24 tests passed
 ✓ |browser| 13 tests passed
```

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: No lint errors in new test files. Biome should handle `.tsx` files fine.

- [ ] **Step 3: Verify deps are clean**

Check `apps/web/package.json` devDependencies. Should contain:
- `@vitest/browser` — new
- `playwright` — new
- `vitest-browser-react` — new
- `@playwright/test` — existing (E2E, unchanged)
- `vitest` — existing (unchanged)

Should NOT contain:
- `@testing-library/react` — removed
- `@testing-library/jest-dom` — removed
- `jsdom` — removed

- [ ] **Step 4: Commit any cleanup**

If any lint fixes or minor adjustments were needed:

```bash
git add -A
git commit -m "chore: lint fixes for browser mode tests"
```
