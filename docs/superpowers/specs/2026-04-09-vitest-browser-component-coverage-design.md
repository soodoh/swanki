# Vitest Browser Component Coverage Design

Date: 2026-04-09
Status: Approved for planning

## Goal

Add Vitest browser-mode test coverage for every currently-untested component in `apps/web/src/components`, including `components/ui/*`.

The suite should be behavior-first rather than exhaustive. App-specific components should get meaningful user-facing assertions. Thin UI wrapper components should get smaller contract tests that verify the behavior this repository owns without re-testing third-party libraries in depth.

## Scope

The current browser-test baseline covers:

- `apps/web/src/components/browse/search-bar.tsx`
- `apps/web/src/components/study/rating-buttons.tsx`
- `apps/web/src/components/study/study-progress.tsx`

This design covers the remaining `46` untested component files under `apps/web/src/components`.

Included:

- App-specific components
- Stats components
- Import flow components
- Study and browse components
- Note type editor components
- Shared `components/ui/*` primitives and wrappers

Excluded:

- End-to-end Playwright specs
- Non-component unit tests
- Desktop-only components
- Refactoring unrelated production code unless required to make testing practical

## Constraints And Principles

- Use Vitest browser mode with the existing `apps/web/vitest.config.ts` setup.
- Co-locate tests as `*.test.tsx` beside the component they cover.
- Prefer real browser interaction and real component rendering by default.
- Mock only when a heavy dependency boundary becomes the main subject under test and the mock materially simplifies the test without losing confidence in Swanki-owned behavior.
- Prefer assertions based on roles, labels, visible text, and callback results over snapshots.
- Keep helpers minimal and shared only when repeated setup is clearly emerging.

## Recommended Approach

Use a risk-tiered, behavior-first browser test suite.

This is preferred over a flat file-by-file parity effort because it gives deeper coverage to the components that contain Swanki behavior while still ensuring every missing component file receives direct coverage. It also avoids turning `components/ui/*` into a large set of low-value snapshot tests.

## Test Architecture

### Co-located Test Files

Each currently-untested component file should receive a sibling `*.test.tsx` file so coverage is obvious from the directory tree and automatically discovered by the existing Vitest browser project.

### Three Test Layers

#### 1. App Behavior Tests

These cover components where Swanki owns meaningful behavior:

- dialogs
- editors
- browse controls
- import flow screens
- study controls
- shell and sidebar composition

Tests in this layer should exercise realistic user-visible behavior such as:

- loading, empty, success, and error states
- form entry and callback payloads
- open/close state changes
- tab switching
- dropdown interaction
- DOM updates after prop or state changes
- keyboard-triggered behavior when exposed by the component
- template insertion, sanitization, and media rendering behavior where applicable

#### 2. UI Contract Tests

These cover `components/ui/*` wrapper components as contracts rather than as exhaustive library re-tests.

The purpose is to verify the behavior owned by this repository, such as:

- forwarding children and props
- disabled state and variant rendering
- accessible labeling and roles
- controlled and uncontrolled visibility state
- trigger/content composition
- portal rendering behavior
- keyboard interaction where the wrapper exposes it

Tests in this layer should stay compact and avoid asserting internal implementation details of upstream libraries.

#### 3. Harness-Backed Integration Tests

Some app components depend on providers, browser APIs, or hook-backed state. These tests should use small reusable harnesses so coverage remains realistic without repeating setup in every file.

Likely harness responsibilities:

- theme context
- router or query context when required
- platform context
- common browser shims such as `matchMedia` or `ResizeObserver`
- stable fake data builders for note types, cards, stats, and import previews

## Coverage Tiers

### Tier 1: Behavior-Heavy App Components

These should receive multi-scenario browser tests with direct user interaction where relevant:

- `app-shell.tsx`
- `browse/browse-filters.tsx`
- `browse/field-attachments.tsx`
- `browse/note-editor-dialog.tsx`
- `browse/note-table.tsx`
- `css-code-editor.tsx`
- `deck-tree.tsx`
- `import/apkg-card-preview.tsx`
- `import/configure-step.tsx`
- `import/preview-step.tsx`
- `import/progress-step.tsx`
- `import/upload-step.tsx`
- `note-type-editor-dialog.tsx`
- `note-type-editor-tabs.tsx`
- `sidebar.tsx`
- `study/card-display.tsx`
- `study/custom-study-dialog.tsx`
- `template-code-editor.tsx`

Expected depth:

- several scenarios per file
- realistic interaction over shallow rendering
- explicit state coverage where the component branches visually

### Tier 2: Data-Display App Components

These should receive state-focused tests, typically covering loading, empty, and populated states:

- `stats/card-state-chart.tsx`
- `stats/heatmap.tsx`
- `stats/review-chart.tsx`
- `stats/streak-display.tsx`

Expected depth:

- verify visible state transitions and key labels
- avoid pixel-perfect chart assertions
- prefer chart contract assertions that confirm user-visible data is represented

### Tier 3: UI Contract Components

These should receive smaller contract tests:

- `ui/avatar.tsx`
- `ui/badge.tsx`
- `ui/button.tsx`
- `ui/card.tsx`
- `ui/carousel.tsx`
- `ui/checkbox.tsx`
- `ui/collapsible.tsx`
- `ui/command.tsx`
- `ui/dialog.tsx`
- `ui/dropdown-menu.tsx`
- `ui/input-group.tsx`
- `ui/input.tsx`
- `ui/label.tsx`
- `ui/progress.tsx`
- `ui/scroll-area.tsx`
- `ui/select.tsx`
- `ui/separator.tsx`
- `ui/sheet.tsx`
- `ui/sidebar.tsx`
- `ui/skeleton.tsx`
- `ui/table.tsx`
- `ui/tabs.tsx`
- `ui/textarea.tsx`
- `ui/tooltip.tsx`

Expected depth:

- one or a few targeted scenarios per file
- direct interaction for interactive components
- render and prop-forwarding assertions for non-interactive wrappers

## Dependency Strategy

Default to real integrations in browser mode.

Apply mocking only at the dependency boundary when all of the following are true:

1. the dependency is significantly heavier than the Swanki behavior under test
2. the real integration adds setup cost or flakiness disproportionate to the confidence gained
3. the test can still assert meaningful Swanki-owned behavior after the mock is introduced

Likely candidates for selective mocking, only if needed:

- chart internals
- CodeMirror internals
- drag-and-drop internals
- browser APIs absent from the Vitest environment

Even when mocking is used, the test should remain interaction-first and should not collapse into implementation-detail assertions.

## Error Handling Coverage

For hook-driven and stateful components, tests should cover distinct rendered branches when present:

- loading
- empty
- success
- failure

If a component does not visibly distinguish all of these states, tests should cover only the branches the user can actually observe.

## Shared Test Utilities

Add only the minimum shared utilities needed to keep the suite maintainable.

Preferred shared utilities:

- provider-aware render helpers
- browser API shims used by multiple test files
- reusable fake-data factories

Avoid:

- large generic abstraction layers around `render`
- custom DSLs for interaction
- per-component helpers that hide assertions

## Verification Plan

During implementation:

- run targeted browser tests by file or component area while building out coverage

Before completion:

- run the full web Vitest suite so both node and browser projects pass under the workspace config

Success criteria:

- every currently-untested component file under `apps/web/src/components` has a colocated `*.test.tsx`
- app-specific components have behavior-focused assertions instead of smoke-only rendering checks
- `components/ui/*` wrappers have compact contract tests appropriate to their ownership boundary
- shared setup is centralized only where repetition justifies it

## Risks And Mitigations

### Risk: Third-Party Browser Components Increase Flakiness

Examples include CodeMirror, Recharts, portals, and drag-and-drop behavior.

Mitigation:

- start with real integration tests
- centralize any required browser shims
- mock only the heavy boundary if real integration becomes unstable or disproportionately expensive

### Risk: “All Components” Produces Inconsistent Test Depth

Mitigation:

- use the three coverage tiers defined above
- review tests against tier expectations instead of aiming for uniform test counts

### Risk: UI Wrapper Tests Drift Into Library Re-Testing

Mitigation:

- keep assertions focused on wrapper-owned contracts
- avoid exhaustive behavior matrices for upstream primitives

## Out Of Scope For This Design

- Changing production component APIs solely to make tests easier
- Introducing a separate browser-only test framework
- Replacing Playwright end-to-end tests
- Expanding coverage outside `apps/web/src/components`
