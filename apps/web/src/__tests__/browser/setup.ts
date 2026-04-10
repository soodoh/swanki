import { afterEach, beforeEach, vi } from "vitest";

class MockResizeObserver {
	constructor(_callback: ResizeObserverCallback) {}

	observe(): void {}

	unobserve(): void {}

	disconnect(): void {}

	takeRecords(): ResizeObserverEntry[] {
		return [];
	}
}

function createMatchMedia(matches = false): typeof window.matchMedia {
	return vi.fn((query: string) => {
		const isDarkQuery = query.includes("(prefers-color-scheme: dark)");

		return {
			matches: isDarkQuery ? matches : false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn().mockReturnValue(false),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			// `vitest-browser-react` components only need a stable object shape.
		} as MediaQueryList;
	}) as typeof window.matchMedia;
}

beforeEach(() => {
	vi.stubGlobal("matchMedia", createMatchMedia());
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	document.body.innerHTML = "";
	document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
	document.documentElement.classList.remove("dark", "light");
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
