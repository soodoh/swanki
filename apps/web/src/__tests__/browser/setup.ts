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
	return ((query: string) =>
		({
			matches,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
			addListener: () => {},
			removeListener: () => {},
			// `vitest-browser-react` components only need a stable object shape.
		}) as MediaQueryList) as typeof window.matchMedia;
}

beforeEach(() => {
	vi.stubGlobal("matchMedia", createMatchMedia());
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
	document.documentElement.classList.remove("dark", "light");
	vi.unstubAllGlobals();
});
