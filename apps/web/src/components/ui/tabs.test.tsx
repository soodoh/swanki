import {
	createContext,
	type ReactNode,
	useContext,
	useState,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

type TabsContextValue = {
	value: string | undefined;
	setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

vi.mock("@base-ui/react/tabs", () => ({
	Tabs: {
		Root: ({
			defaultValue,
			value,
			onValueChange,
			children,
			...props
		}: {
			defaultValue?: string;
			value?: string;
			onValueChange?: (value: string) => void;
			children: ReactNode;
		}) => {
			const [internalValue, setInternalValue] = useState(defaultValue);
			const currentValue = value ?? internalValue;
			const setValue = (nextValue: string) => {
				onValueChange?.(nextValue);
				if (value === undefined) {
					setInternalValue(nextValue);
				}
			};

			return (
				<TabsContext.Provider value={{ value: currentValue, setValue }}>
					<div {...props}>{children}</div>
				</TabsContext.Provider>
			);
		},
		List: ({ children, ...props }: { children: ReactNode }) => (
			<div role="tablist" {...props}>
				{children}
			</div>
		),
		Tab: ({
			value,
			children,
			...props
		}: {
			value: string;
			children: ReactNode;
		}) => {
			const context = useContext(TabsContext);
			if (!context) throw new Error("missing context");

			const active = context.value === value;
			return (
				<button
					type="button"
					role="tab"
					aria-selected={active}
					data-active={active ? "" : undefined}
					onClick={() => context.setValue(value)}
					{...props}
				>
					{children}
				</button>
			);
		},
		Panel: ({
			value,
			children,
			...props
		}: {
			value: string;
			children: ReactNode;
		}) => {
			const context = useContext(TabsContext);
			if (!context) throw new Error("missing context");
			if (context.value !== value) return null;
			return (
				<div role="tabpanel" {...props}>
					{children}
				</div>
			);
		},
	},
}));

describe("Tabs", () => {
	it("renders the active panel for the controlled value", async () => {
		const screen = await render(
			<Tabs value="deck">
				<TabsList>
					<TabsTrigger value="deck">Deck</TabsTrigger>
					<TabsTrigger value="cards">Cards</TabsTrigger>
				</TabsList>
				<TabsContent value="deck">Deck content</TabsContent>
				<TabsContent value="cards">Cards content</TabsContent>
			</Tabs>,
		);

		await expect.element(screen.getByText("Deck content")).toBeVisible();
		expect(screen.container.querySelector('[data-slot="tabs-trigger"][data-active]')).toBeTruthy();
	});
});
