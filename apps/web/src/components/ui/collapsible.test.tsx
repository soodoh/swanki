import {
	createContext,
	type ReactNode,
	useContext,
	useState,
} from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "./collapsible";

type CollapsibleContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
};

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

vi.mock("@base-ui/react/collapsible", () => ({
	Collapsible: {
		Root: ({
			defaultOpen = false,
			children,
			...props
		}: {
			defaultOpen?: boolean;
			children: ReactNode;
		}) => {
			const [open, setOpen] = useState(defaultOpen);

			return (
				<CollapsibleContext.Provider value={{ open, setOpen }}>
					<div data-open={open} {...props}>
						{children}
					</div>
				</CollapsibleContext.Provider>
			);
		},
		Trigger: ({
			children,
			...props
		}: {
			children: ReactNode;
		}) => {
			const context = useContext(CollapsibleContext);
			if (!context) throw new Error("missing context");

			return (
				<button
					type="button"
					aria-expanded={context.open}
					onClick={() => context.setOpen(!context.open)}
					{...props}
				>
					{children}
				</button>
			);
		},
		Panel: ({
			children,
			...props
		}: {
			children: ReactNode;
		}) => {
			const context = useContext(CollapsibleContext);
			if (!context) throw new Error("missing context");
			if (!context.open) return null;
			return <div {...props}>{children}</div>;
		},
	},
}));

describe("Collapsible", () => {
	it("renders the open content in controlled state", async () => {
		const screen = await render(
			<Collapsible defaultOpen>
				<CollapsibleTrigger>More details</CollapsibleTrigger>
				<CollapsibleContent>Hidden copy</CollapsibleContent>
			</Collapsible>,
		);

		const trigger = screen.getByRole("button", { name: "More details" });
		await expect.element(trigger).toHaveAttribute("data-slot", "collapsible-trigger");
		await expect.element(screen.getByText("Hidden copy")).toBeVisible();
	});
});
