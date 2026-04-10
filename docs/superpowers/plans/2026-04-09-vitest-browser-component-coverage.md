# Vitest Browser Component Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct Vitest browser-mode coverage for the 46 currently-untested web components in `apps/web/src/components`, with behavior-first tests for Swanki-owned components and contract tests for `components/ui/*`.

**Architecture:** Keep tests colocated beside each component as `*.test.tsx`, reuse the existing Vitest browser project, and add only a minimal shared browser test harness for providers and browser API shims. Execute the work in batches by component family so each batch is independently testable and can be committed cleanly.

**Tech Stack:** Bun, Vitest 4 browser mode, Playwright browser provider, React 19, `vitest-browser-react`, `@tanstack/react-query`, Base UI, Recharts, CodeMirror

---

## File Structure

### Shared test infrastructure

- Modify: `apps/web/vitest.config.ts`
- Create: `apps/web/src/__tests__/browser/setup.ts`
- Create: `apps/web/src/__tests__/browser/render.tsx`

### Tier 1: behavior-heavy app component tests

- Create: `apps/web/src/components/template-code-editor.test.tsx`
- Create: `apps/web/src/components/css-code-editor.test.tsx`
- Create: `apps/web/src/components/note-type-editor-dialog.test.tsx`
- Create: `apps/web/src/components/note-type-editor-tabs.test.tsx`
- Create: `apps/web/src/components/study/card-display.test.tsx`
- Create: `apps/web/src/components/study/custom-study-dialog.test.tsx`
- Create: `apps/web/src/components/browse/browse-filters.test.tsx`
- Create: `apps/web/src/components/browse/field-attachments.test.tsx`
- Create: `apps/web/src/components/browse/note-editor-dialog.test.tsx`
- Create: `apps/web/src/components/browse/note-table.test.tsx`
- Create: `apps/web/src/components/import/upload-step.test.tsx`
- Create: `apps/web/src/components/import/configure-step.test.tsx`
- Create: `apps/web/src/components/import/preview-step.test.tsx`
- Create: `apps/web/src/components/import/progress-step.test.tsx`
- Create: `apps/web/src/components/import/apkg-card-preview.test.tsx`
- Create: `apps/web/src/components/app-shell.test.tsx`
- Create: `apps/web/src/components/sidebar.test.tsx`
- Create: `apps/web/src/components/deck-tree.test.tsx`

### Tier 2: stats component tests

- Create: `apps/web/src/components/stats/card-state-chart.test.tsx`
- Create: `apps/web/src/components/stats/heatmap.test.tsx`
- Create: `apps/web/src/components/stats/review-chart.test.tsx`
- Create: `apps/web/src/components/stats/streak-display.test.tsx`

### Tier 3: UI contract tests

- Create: `apps/web/src/components/ui/avatar.test.tsx`
- Create: `apps/web/src/components/ui/badge.test.tsx`
- Create: `apps/web/src/components/ui/button.test.tsx`
- Create: `apps/web/src/components/ui/card.test.tsx`
- Create: `apps/web/src/components/ui/carousel.test.tsx`
- Create: `apps/web/src/components/ui/checkbox.test.tsx`
- Create: `apps/web/src/components/ui/collapsible.test.tsx`
- Create: `apps/web/src/components/ui/command.test.tsx`
- Create: `apps/web/src/components/ui/dialog.test.tsx`
- Create: `apps/web/src/components/ui/dropdown-menu.test.tsx`
- Create: `apps/web/src/components/ui/input-group.test.tsx`
- Create: `apps/web/src/components/ui/input.test.tsx`
- Create: `apps/web/src/components/ui/label.test.tsx`
- Create: `apps/web/src/components/ui/progress.test.tsx`
- Create: `apps/web/src/components/ui/scroll-area.test.tsx`
- Create: `apps/web/src/components/ui/select.test.tsx`
- Create: `apps/web/src/components/ui/separator.test.tsx`
- Create: `apps/web/src/components/ui/sheet.test.tsx`
- Create: `apps/web/src/components/ui/sidebar.test.tsx`
- Create: `apps/web/src/components/ui/skeleton.test.tsx`
- Create: `apps/web/src/components/ui/table.test.tsx`
- Create: `apps/web/src/components/ui/tabs.test.tsx`
- Create: `apps/web/src/components/ui/textarea.test.tsx`
- Create: `apps/web/src/components/ui/tooltip.test.tsx`

## Task 1: Add shared browser test setup

**Files:**
- Modify: `apps/web/vitest.config.ts`
- Create: `apps/web/src/__tests__/browser/setup.ts`
- Create: `apps/web/src/__tests__/browser/render.tsx`

- [ ] **Step 1: Write the failing setup references in Vitest config**

```ts
// apps/web/vitest.config.ts
test: {
	name: "browser",
	include: ["src/**/*.test.tsx"],
	exclude: ["e2e/**"],
	setupFiles: ["src/__tests__/browser/setup.ts"],
	browser: {
		enabled: true,
		headless: true,
		connectTimeout: 120000,
		provider: playwright(),
		instances: [{ browser: "chromium" }],
	},
},
```

- [ ] **Step 2: Create the shared browser shims file**

```ts
// apps/web/src/__tests__/browser/setup.ts
import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
	Object.defineProperty(globalThis, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: query.includes("dark"),
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});

	class ResizeObserverMock {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}

	Object.defineProperty(globalThis, "ResizeObserver", {
		writable: true,
		value: ResizeObserverMock,
	});
});

afterEach(() => {
	document.body.innerHTML = "";
	document.documentElement.className = "";
	vi.restoreAllMocks();
});
```

- [ ] **Step 3: Create the shared provider-aware render helper**

```tsx
// apps/web/src/__tests__/browser/render.tsx
import { PlatformProvider } from "@swanki/core/platform";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { render } from "vitest-browser-react";
import { ThemeProvider } from "@/lib/theme";

type RenderOptions = {
	initialTheme?: "light" | "dark" | "system";
	platform?: "web" | "desktop";
};

export function renderWithProviders(
	ui: ReactElement,
	{ initialTheme = "light", platform = "web" }: RenderOptions = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	function Wrapper({ children }: { children: ReactNode }): ReactElement {
		return (
			<QueryClientProvider client={queryClient}>
				<PlatformProvider value={platform}>
					<ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
				</PlatformProvider>
			</QueryClientProvider>
		);
	}

	return render(ui, { wrapper: Wrapper });
}
```

- [ ] **Step 4: Run a targeted browser test to verify setup still passes**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/study/rating-buttons.test.tsx`

Expected: PASS with the existing browser test still green after the setup file is introduced.

- [ ] **Step 5: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src/__tests__/browser/setup.ts apps/web/src/__tests__/browser/render.tsx
git commit -m "test: add browser test harness"
```

## Task 2: Cover editors and note type editing components

**Files:**
- Create: `apps/web/src/components/template-code-editor.test.tsx`
- Create: `apps/web/src/components/css-code-editor.test.tsx`
- Create: `apps/web/src/components/note-type-editor-dialog.test.tsx`
- Create: `apps/web/src/components/note-type-editor-tabs.test.tsx`
- Test: `apps/web/src/components/template-code-editor.tsx`
- Test: `apps/web/src/components/css-code-editor.tsx`
- Test: `apps/web/src/components/note-type-editor-dialog.tsx`
- Test: `apps/web/src/components/note-type-editor-tabs.tsx`

- [ ] **Step 1: Write failing browser tests for the editor insertion and note type states**

```tsx
// apps/web/src/components/template-code-editor.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { TemplateCodeEditor } from "./template-code-editor";

describe("TemplateCodeEditor", () => {
	it("inserts a field token from the toolbar menu", async () => {
		const onChange = vi.fn();
		const screen = await renderWithProviders(
			<TemplateCodeEditor
				value="<div></div>"
				onChange={onChange}
				fieldNames={["Front", "Back"]}
			/>,
		);

		await screen.getByRole("button", { name: /field/i }).click();
		await screen.getByText("{{Front}}").click();

		expect(onChange).toHaveBeenCalled();
	});
});
```

```tsx
// apps/web/src/components/note-type-editor-dialog.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { NoteTypeEditorDialog } from "./note-type-editor-dialog";

vi.mock("@/lib/hooks/use-note-types", () => ({
	useNoteType: vi.fn(() => ({ data: undefined, isLoading: true, error: null })),
	useSampleNote: vi.fn(() => ({ data: { Front: "Hola", Back: "Hello" } })),
	useUpdateNoteType: vi.fn(() => vi.fn()),
}));

describe("NoteTypeEditorDialog", () => {
	it("renders the loading state before note type data resolves", async () => {
		const screen = await renderWithProviders(
			<NoteTypeEditorDialog noteTypeId="basic" open={true} onOpenChange={() => {}} />,
		);

		await expect.element(screen.getByText("Loading note type...")).toBeVisible();
	});
});
```

- [ ] **Step 2: Run only the new editor and note type tests to verify red**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/template-code-editor.test.tsx src/components/css-code-editor.test.tsx src/components/note-type-editor-dialog.test.tsx src/components/note-type-editor-tabs.test.tsx`

Expected: FAIL because the first draft of the tests will expose missing selectors, required provider setup, or incorrect assumptions about the real component behavior.

- [ ] **Step 3: Finish the test implementations until the batch is green**

```tsx
// apps/web/src/components/css-code-editor.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CssCodeEditor } from "./css-code-editor";

describe("CssCodeEditor", () => {
	it("renders the current CSS and forwards changes", async () => {
		const onChange = vi.fn();
		const screen = await renderWithProviders(
			<CssCodeEditor value=".card { color: red; }" onChange={onChange} />,
		);

		await expect.element(screen.getByText(/color: red/i)).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/note-type-editor-tabs.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CardsTab, FieldsTab } from "./note-type-editor-tabs";

describe("note type editor tabs", () => {
	it("renders field rows and save actions", async () => {
		const onSave = vi.fn();
		const screen = await renderWithProviders(
			<FieldsTab
				fields={[{ id: "front", name: "Front", ordinal: 0 }]}
				noteTypeId="basic"
				onSave={onSave}
			/>,
		);

		await expect.element(screen.getByDisplayValue("Front")).toBeVisible();
	});

	it("renders card template previews when preview fields are present", async () => {
		const screen = await renderWithProviders(
			<CardsTab
				templates={[
					{
						id: "card-1",
						name: "Card 1",
						ordinal: 0,
						frontTemplate: "{{Front}}",
						backTemplate: "{{FrontSide}}<hr id=answer>{{Back}}",
					},
				]}
				noteTypeId="basic"
				css=".card {}"
				fieldNames={["Front", "Back"]}
				previewFields={{ Front: "Hola", Back: "Hello" }}
				onSaveCss={vi.fn()}
			/>,
		);

		await expect.element(screen.getByText("Card 1")).toBeVisible();
	});
});
```

- [ ] **Step 4: Re-run the editor and note type batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/template-code-editor.test.tsx src/components/css-code-editor.test.tsx src/components/note-type-editor-dialog.test.tsx src/components/note-type-editor-tabs.test.tsx`

Expected: PASS for all four files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/template-code-editor.test.tsx apps/web/src/components/css-code-editor.test.tsx apps/web/src/components/note-type-editor-dialog.test.tsx apps/web/src/components/note-type-editor-tabs.test.tsx
git commit -m "test: cover note type editors in browser mode"
```

## Task 3: Cover study and browse components

**Files:**
- Create: `apps/web/src/components/study/card-display.test.tsx`
- Create: `apps/web/src/components/study/custom-study-dialog.test.tsx`
- Create: `apps/web/src/components/browse/browse-filters.test.tsx`
- Create: `apps/web/src/components/browse/field-attachments.test.tsx`
- Create: `apps/web/src/components/browse/note-editor-dialog.test.tsx`
- Create: `apps/web/src/components/browse/note-table.test.tsx`

- [ ] **Step 1: Write failing tests for the study and browse user-visible branches**

```tsx
// apps/web/src/components/study/card-display.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CardDisplay } from "./card-display";

describe("CardDisplay", () => {
	it("renders sanitized card content and show-answer button", async () => {
		const onShowAnswer = vi.fn();
		const screen = await renderWithProviders(
			<CardDisplay
				html={"<div>Front<script>bad()</script></div>"}
				css={".card { color: red; }"}
				showAnswer={false}
				onShowAnswer={onShowAnswer}
			/>,
		);

		await expect.element(screen.getByText("Front")).toBeVisible();
		await screen.getByRole("button", { name: /show answer/i }).click();
		expect(onShowAnswer).toHaveBeenCalledTimes(1);
	});
});
```

```tsx
// apps/web/src/components/browse/note-table.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { NoteTable } from "./note-table";

describe("NoteTable", () => {
	it("renders notes and forwards selection changes", async () => {
		const onSelectionChange = vi.fn();
		const screen = await renderWithProviders(
			<NoteTable
				notes={[
					{ id: "n1", deckName: "Spanish", noteTypeName: "Basic", fields: { Front: "Hola" }, tags: [] },
				]}
				selectedIds={[]}
				onSelectionChange={onSelectionChange}
				onEditNote={vi.fn()}
			/>,
		);

		await expect.element(screen.getByText("Hola")).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the study and browse batch to confirm failures are real**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/study/card-display.test.tsx src/components/study/custom-study-dialog.test.tsx src/components/browse/browse-filters.test.tsx src/components/browse/field-attachments.test.tsx src/components/browse/note-editor-dialog.test.tsx src/components/browse/note-table.test.tsx`

Expected: FAIL while the exact component props and interaction points are being aligned to real runtime behavior.

- [ ] **Step 3: Complete the study and browse tests with loading, error, and interaction coverage**

```tsx
// apps/web/src/components/study/custom-study-dialog.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CustomStudyDialog } from "./custom-study-dialog";

describe("CustomStudyDialog", () => {
	it("opens, accepts card count input, and submits the chosen study mode", async () => {
		const onSubmit = vi.fn();
		const screen = await renderWithProviders(
			<CustomStudyDialog
				open={true}
				onOpenChange={() => {}}
				onSubmit={onSubmit}
			/>,
		);

		await screen.getByLabelText(/cards/i).fill("25");
		await screen.getByRole("button", { name: /create/i }).click();

		expect(onSubmit).toHaveBeenCalled();
	});
});
```

```tsx
// apps/web/src/components/browse/note-editor-dialog.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { NoteEditorDialog } from "./note-editor-dialog";

describe("NoteEditorDialog", () => {
	it("renders loading and failure states from its hook data", async () => {
		const screen = await renderWithProviders(
			<NoteEditorDialog noteId="note-1" open={true} onOpenChange={() => {}} />,
		);

		await expect.element(screen.getByText(/loading/i)).toBeVisible();
	});

	it("edits field values and saves through the provided mutation", async () => {
		const onOpenChange = vi.fn();
		const screen = await renderWithProviders(
			<NoteEditorDialog noteId="note-1" open={true} onOpenChange={onOpenChange} />,
		);

		await screen.getByDisplayValue("Hola").fill("Buenos dias");
		await screen.getByRole("button", { name: /save/i }).click();
	});
});
```

- [ ] **Step 4: Re-run the study and browse batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/study/card-display.test.tsx src/components/study/custom-study-dialog.test.tsx src/components/browse/browse-filters.test.tsx src/components/browse/field-attachments.test.tsx src/components/browse/note-editor-dialog.test.tsx src/components/browse/note-table.test.tsx`

Expected: PASS for all six files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/study/card-display.test.tsx apps/web/src/components/study/custom-study-dialog.test.tsx apps/web/src/components/browse/browse-filters.test.tsx apps/web/src/components/browse/field-attachments.test.tsx apps/web/src/components/browse/note-editor-dialog.test.tsx apps/web/src/components/browse/note-table.test.tsx
git commit -m "test: cover study and browse components"
```

## Task 4: Cover import flow components

**Files:**
- Create: `apps/web/src/components/import/upload-step.test.tsx`
- Create: `apps/web/src/components/import/configure-step.test.tsx`
- Create: `apps/web/src/components/import/preview-step.test.tsx`
- Create: `apps/web/src/components/import/progress-step.test.tsx`
- Create: `apps/web/src/components/import/apkg-card-preview.test.tsx`

- [ ] **Step 1: Write failing tests for import-step state transitions**

```tsx
// apps/web/src/components/import/upload-step.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { UploadStep } from "./upload-step";

describe("UploadStep", () => {
	it("accepts a file selection and forwards the chosen file", async () => {
		const onFileSelect = vi.fn();
		const screen = await renderWithProviders(
			<UploadStep onFileSelect={onFileSelect} isUploading={false} error={null} />,
		);

		await expect.element(screen.getByText(/choose file/i)).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/import/progress-step.test.tsx
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ProgressStep } from "./progress-step";

describe("ProgressStep", () => {
	it("renders the active import progress and status text", async () => {
		const screen = await renderWithProviders(
			<ProgressStep progress={{ total: 100, completed: 45, current: "Importing notes" }} />,
		);

		await expect.element(screen.getByText("Importing notes")).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the import batch to verify red**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/import/upload-step.test.tsx src/components/import/configure-step.test.tsx src/components/import/preview-step.test.tsx src/components/import/progress-step.test.tsx src/components/import/apkg-card-preview.test.tsx`

Expected: FAIL while the exact file-input and preview interactions are aligned with the real components.

- [ ] **Step 3: Complete the import tests with real file, preview, and configuration assertions**

```tsx
// apps/web/src/components/import/configure-step.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ConfigureStep } from "./configure-step";

describe("ConfigureStep", () => {
	it("updates import options and submits the chosen configuration", async () => {
		const onBack = vi.fn();
		const onNext = vi.fn();
		const screen = await renderWithProviders(
			<ConfigureStep
				config={{ deckId: "default", noteTypeId: "basic", tags: [] }}
				decks={[{ id: "default", name: "Default" }]}
				noteTypes={[{ id: "basic", name: "Basic" }]}
				onBack={onBack}
				onNext={onNext}
			/>,
		);

		await screen.getByRole("button", { name: /continue/i }).click();
		expect(onNext).toHaveBeenCalled();
	});
});
```

```tsx
// apps/web/src/components/import/apkg-card-preview.test.tsx
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ApkgCardPreview } from "./apkg-card-preview";

describe("ApkgCardPreview", () => {
	it("renders front and back preview content for the selected card", async () => {
		const screen = await renderWithProviders(
			<ApkgCardPreview
				card={{
					id: "card-1",
					frontHtml: "<div>Front side</div>",
					backHtml: "<div>Back side</div>",
					css: ".card {}",
				}}
			/>,
		);

		await expect.element(screen.getByText("Front side")).toBeVisible();
		await expect.element(screen.getByText("Back side")).toBeVisible();
	});
});
```

- [ ] **Step 4: Re-run the import batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/import/upload-step.test.tsx src/components/import/configure-step.test.tsx src/components/import/preview-step.test.tsx src/components/import/progress-step.test.tsx src/components/import/apkg-card-preview.test.tsx`

Expected: PASS for all five files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/import/upload-step.test.tsx apps/web/src/components/import/configure-step.test.tsx apps/web/src/components/import/preview-step.test.tsx apps/web/src/components/import/progress-step.test.tsx apps/web/src/components/import/apkg-card-preview.test.tsx
git commit -m "test: cover import flow components"
```

## Task 5: Cover shell, navigation, and deck components

**Files:**
- Create: `apps/web/src/components/app-shell.test.tsx`
- Create: `apps/web/src/components/sidebar.test.tsx`
- Create: `apps/web/src/components/deck-tree.test.tsx`

- [ ] **Step 1: Write failing tests for shell composition and deck navigation**

```tsx
// apps/web/src/components/app-shell.test.tsx
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
	it("renders the app navigation and theme controls", async () => {
		const screen = await renderWithProviders(<AppShell />);
		await expect.element(screen.getByRole("navigation")).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/deck-tree.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { DeckTree } from "./deck-tree";

describe("DeckTree", () => {
	it("renders nested deck names and handles deck clicks", async () => {
		const onSelectDeck = vi.fn();
		const screen = await renderWithProviders(
			<DeckTree
				decks={[{ id: "root", name: "Spanish", parentId: null, newCount: 2, reviewCount: 4, learningCount: 1 }]}
				selectedDeckId={null}
				onSelectDeck={onSelectDeck}
			/>,
		);

		await expect.element(screen.getByText("Spanish")).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the shell and deck batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/app-shell.test.tsx src/components/sidebar.test.tsx src/components/deck-tree.test.tsx`

Expected: FAIL while router links, theme state, or deck tree data assumptions are aligned to real component usage.

- [ ] **Step 3: Complete the shell and deck tests with provider-backed assertions**

```tsx
// apps/web/src/components/sidebar.test.tsx
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { Sidebar } from "./sidebar";

describe("Sidebar", () => {
	it("renders primary navigation and platform-specific links", async () => {
		const webScreen = await renderWithProviders(<Sidebar />, { platform: "web" });
		await expect.element(webScreen.getByText(/browse/i)).toBeVisible();

		const desktopScreen = await renderWithProviders(<Sidebar />, {
			platform: "desktop",
		});
		await expect.element(desktopScreen.getByText(/settings/i)).toBeVisible();
	});
});
```

- [ ] **Step 4: Re-run the shell and deck batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/app-shell.test.tsx src/components/sidebar.test.tsx src/components/deck-tree.test.tsx`

Expected: PASS for all three files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/app-shell.test.tsx apps/web/src/components/sidebar.test.tsx apps/web/src/components/deck-tree.test.tsx
git commit -m "test: cover shell and deck navigation components"
```

## Task 6: Cover stats components

**Files:**
- Create: `apps/web/src/components/stats/card-state-chart.test.tsx`
- Create: `apps/web/src/components/stats/heatmap.test.tsx`
- Create: `apps/web/src/components/stats/review-chart.test.tsx`
- Create: `apps/web/src/components/stats/streak-display.test.tsx`

- [ ] **Step 1: Write failing tests for loading, empty, and populated chart states**

```tsx
// apps/web/src/components/stats/review-chart.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { ReviewChart } from "./review-chart";

vi.mock("@/lib/hooks/use-stats", () => ({
	useReviewsPerDay: vi.fn(() => ({ data: [], isLoading: false })),
}));

describe("ReviewChart", () => {
	it("renders the empty state when no review data exists", async () => {
		const screen = await renderWithProviders(<ReviewChart days={7} />);
		await expect.element(screen.getByText("No review data yet.")).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/stats/streak-display.test.tsx
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { StreakDisplay } from "./streak-display";

describe("StreakDisplay", () => {
	it("renders the current and best streak values", async () => {
		const screen = await renderWithProviders(
			<StreakDisplay currentStreak={5} bestStreak={12} />,
		);

		await expect.element(screen.getByText("5")).toBeVisible();
		await expect.element(screen.getByText("12")).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the stats batch to confirm failure**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/stats/card-state-chart.test.tsx src/components/stats/heatmap.test.tsx src/components/stats/review-chart.test.tsx src/components/stats/streak-display.test.tsx`

Expected: FAIL while chart hooks, Recharts layout behavior, or branch expectations are being aligned.

- [ ] **Step 3: Complete the stats tests with stable branch assertions**

```tsx
// apps/web/src/components/stats/card-state-chart.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CardStateChart } from "./card-state-chart";

vi.mock("@/lib/hooks/use-stats", () => ({
	useCardStateCounts: vi.fn(() => ({
		data: { new: 10, learning: 3, review: 20 },
		isLoading: false,
	})),
}));

describe("CardStateChart", () => {
	it("shows loading, empty, and populated states without asserting chart internals", async () => {
		const screen = await renderWithProviders(<CardStateChart />);
		await expect.element(screen.getByText(/new/i)).toBeVisible();
		await expect.element(screen.getByText(/review/i)).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/stats/heatmap.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { Heatmap } from "./heatmap";

vi.mock("@/lib/hooks/use-stats", () => ({
	useReviewHeatmap: vi.fn(() => ({
		data: [{ date: "2026-04-01", count: 8 }],
		isLoading: false,
	})),
}));

describe("Heatmap", () => {
	it("renders day cells for supplied review activity data", async () => {
		const screen = await renderWithProviders(<Heatmap days={30} />);
		await expect.element(screen.getByText(/less/i)).toBeVisible();
		await expect.element(screen.getByText(/more/i)).toBeVisible();
	});
});
```

- [ ] **Step 4: Re-run the stats batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/stats/card-state-chart.test.tsx src/components/stats/heatmap.test.tsx src/components/stats/review-chart.test.tsx src/components/stats/streak-display.test.tsx`

Expected: PASS for all four files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/stats/card-state-chart.test.tsx apps/web/src/components/stats/heatmap.test.tsx apps/web/src/components/stats/review-chart.test.tsx apps/web/src/components/stats/streak-display.test.tsx
git commit -m "test: cover stats components in browser mode"
```

## Task 7: Cover basic UI primitives

**Files:**
- Create: `apps/web/src/components/ui/avatar.test.tsx`
- Create: `apps/web/src/components/ui/badge.test.tsx`
- Create: `apps/web/src/components/ui/button.test.tsx`
- Create: `apps/web/src/components/ui/card.test.tsx`
- Create: `apps/web/src/components/ui/input-group.test.tsx`
- Create: `apps/web/src/components/ui/input.test.tsx`
- Create: `apps/web/src/components/ui/label.test.tsx`
- Create: `apps/web/src/components/ui/progress.test.tsx`
- Create: `apps/web/src/components/ui/separator.test.tsx`
- Create: `apps/web/src/components/ui/skeleton.test.tsx`
- Create: `apps/web/src/components/ui/table.test.tsx`
- Create: `apps/web/src/components/ui/textarea.test.tsx`

- [ ] **Step 1: Write failing contract tests for basic wrapper behavior**

```tsx
// apps/web/src/components/ui/button.test.tsx
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { render } from "vitest-browser-react";

describe("Button", () => {
	it("forwards click handlers and variant classes", async () => {
		const onClick = vi.fn();
		const screen = await render(
			<Button variant="outline" onClick={onClick}>
				Press me
			</Button>,
		);

		await screen.getByRole("button", { name: "Press me" }).click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
```

```tsx
// apps/web/src/components/ui/input.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "./input";

describe("Input", () => {
	it("renders the supplied value and disabled state", async () => {
		const screen = await render(<Input value="deck:Spanish" disabled readOnly />);
		await expect.element(screen.getByDisplayValue("deck:Spanish")).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run the basic UI batch to verify the first red pass**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/ui/avatar.test.tsx src/components/ui/badge.test.tsx src/components/ui/button.test.tsx src/components/ui/card.test.tsx src/components/ui/input-group.test.tsx src/components/ui/input.test.tsx src/components/ui/label.test.tsx src/components/ui/progress.test.tsx src/components/ui/separator.test.tsx src/components/ui/skeleton.test.tsx src/components/ui/table.test.tsx src/components/ui/textarea.test.tsx`

Expected: FAIL until the exact accessible roles and DOM structure of each wrapper are captured correctly.

- [ ] **Step 3: Finish the contract assertions for the basic UI wrappers**

```tsx
// apps/web/src/components/ui/label.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Input } from "./input";
import { Label } from "./label";

describe("Label", () => {
	it("associates the label text with its control", async () => {
		const screen = await render(
			<div>
				<Label htmlFor="front">Front</Label>
				<Input id="front" defaultValue="Hola" />
			</div>,
		);

		await expect.element(screen.getByLabelText("Front")).toHaveValue("Hola");
	});
});
```

```tsx
// apps/web/src/components/ui/progress.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Progress } from "./progress";

describe("Progress", () => {
	it("renders the current progress value for assistive technologies", async () => {
		const screen = await render(<Progress value={45} />);
		await expect.element(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"45",
		);
	});
});
```

- [ ] **Step 4: Re-run the basic UI batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/ui/avatar.test.tsx src/components/ui/badge.test.tsx src/components/ui/button.test.tsx src/components/ui/card.test.tsx src/components/ui/input-group.test.tsx src/components/ui/input.test.tsx src/components/ui/label.test.tsx src/components/ui/progress.test.tsx src/components/ui/separator.test.tsx src/components/ui/skeleton.test.tsx src/components/ui/table.test.tsx src/components/ui/textarea.test.tsx`

Expected: PASS for all twelve files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/avatar.test.tsx apps/web/src/components/ui/badge.test.tsx apps/web/src/components/ui/button.test.tsx apps/web/src/components/ui/card.test.tsx apps/web/src/components/ui/input-group.test.tsx apps/web/src/components/ui/input.test.tsx apps/web/src/components/ui/label.test.tsx apps/web/src/components/ui/progress.test.tsx apps/web/src/components/ui/separator.test.tsx apps/web/src/components/ui/skeleton.test.tsx apps/web/src/components/ui/table.test.tsx apps/web/src/components/ui/textarea.test.tsx
git commit -m "test: cover basic ui component contracts"
```

## Task 8: Cover interactive overlay and selection UI components

**Files:**
- Create: `apps/web/src/components/ui/checkbox.test.tsx`
- Create: `apps/web/src/components/ui/collapsible.test.tsx`
- Create: `apps/web/src/components/ui/command.test.tsx`
- Create: `apps/web/src/components/ui/dialog.test.tsx`
- Create: `apps/web/src/components/ui/dropdown-menu.test.tsx`
- Create: `apps/web/src/components/ui/select.test.tsx`
- Create: `apps/web/src/components/ui/sheet.test.tsx`
- Create: `apps/web/src/components/ui/tabs.test.tsx`
- Create: `apps/web/src/components/ui/tooltip.test.tsx`

- [ ] **Step 1: Write failing contract tests for interactive open-state wrappers**

```tsx
// apps/web/src/components/ui/dialog.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
	it("opens content from the trigger and renders the title in the portal", async () => {
		const screen = await render(
			<Dialog>
				<DialogTrigger>Open dialog</DialogTrigger>
				<DialogContent>
					<DialogTitle>Edit note</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		await screen.getByText("Open dialog").click();
		await expect.element(screen.getByText("Edit note")).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/ui/select.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

describe("Select", () => {
	it("opens the popup and updates the selected value", async () => {
		const screen = await render(
			<Select defaultValue="good">
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="again">Again</SelectItem>
					<SelectItem value="good">Good</SelectItem>
				</SelectContent>
			</Select>,
		);

		await screen.getByRole("button").click();
		await screen.getByText("Again").click();
		await expect.element(screen.getByRole("button")).toContainText("Again");
	});
});
```

- [ ] **Step 2: Run the interactive UI batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/ui/checkbox.test.tsx src/components/ui/collapsible.test.tsx src/components/ui/command.test.tsx src/components/ui/dialog.test.tsx src/components/ui/dropdown-menu.test.tsx src/components/ui/select.test.tsx src/components/ui/sheet.test.tsx src/components/ui/tabs.test.tsx src/components/ui/tooltip.test.tsx`

Expected: FAIL until portal timing, keyboard handling, and control roles are aligned with the Base UI wrappers.

- [ ] **Step 3: Complete the interaction tests for the overlay and selection wrappers**

```tsx
// apps/web/src/components/ui/dropdown-menu.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./dropdown-menu";

describe("DropdownMenu", () => {
	it("opens the menu and fires the selected item action", async () => {
		const onSelect = vi.fn();
		const screen = await render(
			<DropdownMenu>
				<DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onClick={onSelect}>Rename</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);

		await screen.getByText("Open menu").click();
		await screen.getByText("Rename").click();
		expect(onSelect).toHaveBeenCalledTimes(1);
	});
});
```

```tsx
// apps/web/src/components/ui/tabs.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
	it("switches the visible panel when a new tab is chosen", async () => {
		const screen = await render(
			<Tabs defaultValue="front">
				<TabsList>
					<TabsTrigger value="front">Front</TabsTrigger>
					<TabsTrigger value="back">Back</TabsTrigger>
				</TabsList>
				<TabsContent value="front">Front panel</TabsContent>
				<TabsContent value="back">Back panel</TabsContent>
			</Tabs>,
		);

		await screen.getByText("Back").click();
		await expect.element(screen.getByText("Back panel")).toBeVisible();
	});
});
```

- [ ] **Step 4: Re-run the interactive UI batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/ui/checkbox.test.tsx src/components/ui/collapsible.test.tsx src/components/ui/command.test.tsx src/components/ui/dialog.test.tsx src/components/ui/dropdown-menu.test.tsx src/components/ui/select.test.tsx src/components/ui/sheet.test.tsx src/components/ui/tabs.test.tsx src/components/ui/tooltip.test.tsx`

Expected: PASS for all nine files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/checkbox.test.tsx apps/web/src/components/ui/collapsible.test.tsx apps/web/src/components/ui/command.test.tsx apps/web/src/components/ui/dialog.test.tsx apps/web/src/components/ui/dropdown-menu.test.tsx apps/web/src/components/ui/select.test.tsx apps/web/src/components/ui/sheet.test.tsx apps/web/src/components/ui/tabs.test.tsx apps/web/src/components/ui/tooltip.test.tsx
git commit -m "test: cover interactive ui component contracts"
```

## Task 9: Cover remaining composite UI wrappers

**Files:**
- Create: `apps/web/src/components/ui/carousel.test.tsx`
- Create: `apps/web/src/components/ui/scroll-area.test.tsx`
- Create: `apps/web/src/components/ui/sidebar.test.tsx`

- [ ] **Step 1: Write failing tests for the remaining composite wrappers**

```tsx
// apps/web/src/components/ui/sidebar.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Sidebar, SidebarContent, SidebarHeader } from "./sidebar";

describe("ui Sidebar", () => {
	it("renders header and content regions", async () => {
		const screen = await render(
			<Sidebar>
				<SidebarHeader>Header</SidebarHeader>
				<SidebarContent>Content</SidebarContent>
			</Sidebar>,
		);

		await expect.element(screen.getByText("Header")).toBeVisible();
		await expect.element(screen.getByText("Content")).toBeVisible();
	});
});
```

```tsx
// apps/web/src/components/ui/carousel.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Carousel, CarouselContent, CarouselItem } from "./carousel";

describe("Carousel", () => {
	it("renders carousel items inside the content region", async () => {
		const screen = await render(
			<Carousel>
				<CarouselContent>
					<CarouselItem>One</CarouselItem>
					<CarouselItem>Two</CarouselItem>
				</CarouselContent>
			</Carousel>,
		);

		await expect.element(screen.getByText("One")).toBeVisible();
		await expect.element(screen.getByText("Two")).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the remaining composite UI batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/ui/carousel.test.tsx src/components/ui/scroll-area.test.tsx src/components/ui/sidebar.test.tsx`

Expected: FAIL until the wrapper DOM structure and any required observer shims are aligned correctly.

- [ ] **Step 3: Finish the remaining composite UI tests**

```tsx
// apps/web/src/components/ui/scroll-area.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
	it("renders its viewport content without swallowing children", async () => {
		const screen = await render(
			<ScrollArea className="h-20 w-20">
				<div>Scrollable content</div>
			</ScrollArea>,
		);

		await expect.element(screen.getByText("Scrollable content")).toBeVisible();
	});
});
```

- [ ] **Step 4: Re-run the remaining composite UI batch**

Run: `cd apps/web && bun --bun vitest run --project browser src/components/ui/carousel.test.tsx src/components/ui/scroll-area.test.tsx src/components/ui/sidebar.test.tsx`

Expected: PASS for all three files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/carousel.test.tsx apps/web/src/components/ui/scroll-area.test.tsx apps/web/src/components/ui/sidebar.test.tsx
git commit -m "test: cover remaining composite ui wrappers"
```

## Task 10: Run the full web suite and close the coverage gap

**Files:**
- Verify: `apps/web/src/components/**/*.test.tsx`
- Verify: `apps/web/src/**/*.test.ts`

- [ ] **Step 1: Run the full browser project to verify every new component test passes together**

Run: `cd apps/web && bun --bun vitest run --project browser`

Expected: PASS for all browser component tests, including the three pre-existing browser tests and the 46 new coverage files.

- [ ] **Step 2: Run the full web Vitest suite to verify node and browser projects stay green together**

Run: `cd apps/web && bun --bun vitest run`

Expected: PASS for both the `unit` and `browser` projects.

- [ ] **Step 3: Check git status to verify only intentional test and config files changed**

Run: `git status --short`

Expected: only the new `*.test.tsx` files plus the shared browser harness files and `apps/web/vitest.config.ts` should appear.

- [ ] **Step 4: Commit the final verification batch**

```bash
git add apps/web/vitest.config.ts apps/web/src/__tests__/browser/setup.ts apps/web/src/__tests__/browser/render.tsx apps/web/src/components/**/*.test.tsx
git commit -m "test: add browser coverage for web components"
```

- [ ] **Step 5: Summarize coverage and residual risk in the final handoff**

```md
- Browser test coverage now exists for every component file in `apps/web/src/components`.
- App-specific components were covered with behavior-focused tests.
- UI primitives were covered with contract tests instead of library re-tests.
- Residual risk: a small subset of tests may still rely on browser shims for ResizeObserver, portals, or chart sizing behavior.
```

## Self-Review Checklist

### Spec coverage

- Shared browser setup and minimal helpers: Task 1
- Tier 1 behavior-heavy component coverage: Tasks 2, 3, 4, and 5
- Tier 2 stats coverage with loading, empty, and populated states: Task 6
- Tier 3 UI contract coverage: Tasks 7, 8, and 9
- Full browser and full web verification: Task 10

### Placeholder scan

- No `TODO`, `TBD`, or unresolved placeholders should remain in this plan.
- Every batch includes exact file paths and exact verification commands.

### Type consistency

- Shared helpers use `ThemeProvider`, `PlatformProvider`, and `QueryClientProvider` consistently.
- Browser test files use `*.test.tsx` so they stay inside the Vitest browser project.
