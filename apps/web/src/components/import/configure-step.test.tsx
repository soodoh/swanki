import { useState, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import {
	type ImportConfig,
	ConfigureStep,
} from "./configure-step";

const configureMocks = vi.hoisted(() => ({
	useDecks: vi.fn(),
}));

vi.mock("@/lib/hooks/use-decks", () => ({
	useDecks: configureMocks.useDecks,
}));

vi.mock("@/components/ui/checkbox", () => ({
	Checkbox: ({
		id,
		checked,
		onCheckedChange,
	}: {
		id?: string;
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}): ReactElement => (
		<input
			id={id}
			type="checkbox"
			checked={Boolean(checked)}
			onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
		/>
	),
}));

vi.mock("@/components/ui/select", async () => {
	const React = await import("react");

	type SelectContextValue = {
		value?: string;
		open: boolean;
		setOpen: (open: boolean) => void;
		onValueChange?: (value: string) => void;
	};

	const SelectContext = React.createContext<SelectContextValue | null>(null);

	return {
		Select: ({
			value,
			onValueChange,
			children,
		}: {
			value?: string;
			onValueChange?: (value: string) => void;
			children: ReactNode;
		}): ReactElement => {
			const [open, setOpen] = React.useState(false);

			return (
				<SelectContext.Provider
					value={{
						value,
						open,
						setOpen,
						onValueChange,
					}}
				>
					<div>{children}</div>
				</SelectContext.Provider>
			);
		},
		SelectTrigger: ({
			children,
			...props
		}: {
			children: ReactNode;
			"aria-label"?: string;
		}): ReactElement => {
			const context = React.useContext(SelectContext);

			if (!context) {
				throw new Error("SelectTrigger must be used within Select");
			}

			return (
				<button
					type="button"
					onClick={() => context.setOpen(!context.open)}
					{...props}
				>
					{children}
				</button>
			);
		},
		SelectValue: ({
			placeholder,
		}: {
			placeholder?: string;
		}): ReactElement => {
			const context = React.useContext(SelectContext);
			return <span>{context?.value || placeholder || ""}</span>;
		},
		SelectContent: ({
			children,
		}: {
			children: ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(SelectContext);

			return context?.open ? <div role="listbox">{children}</div> : null;
		},
		SelectItem: ({
			value,
			children,
		}: {
			value: string;
			children: ReactNode;
		}): ReactElement => {
			const context = React.useContext(SelectContext);

			if (!context) {
				throw new Error("SelectItem must be used within Select");
			}

			return (
				<button
					type="button"
					role="option"
					onClick={() => {
						context.onValueChange?.(value);
						context.setOpen(false);
					}}
				>
					{children}
				</button>
			);
		},
	};
});

function CsvHarness(): ReactElement {
	const [config, setConfig] = useState<ImportConfig>({
		csv: {
			delimiter: ",",
			hasHeader: true,
			fieldMapping: {
				0: "Front",
				1: "Back",
			},
			targetDeck: "Import",
		},
	});

	return (
		<div className="space-y-2">
			<ConfigureStep
				format="csv"
				file={new File(["Front,Back"], "notes.csv", { type: "text/csv" })}
				config={config}
				onConfigChange={setConfig}
				csvPreview={[
					["Front", "Back"],
					["Hola", "Hello"],
				]}
				csvHeaders={["Front", "Back"]}
			/>
			<output data-testid="config-state">{JSON.stringify(config)}</output>
		</div>
	);
}

function ApkgHarness(): ReactElement {
	const [config, setConfig] = useState<ImportConfig>({
		apkg: { mergeMode: "merge" },
	});

	return (
		<div className="space-y-2">
			<ConfigureStep
				format="apkg"
				file={new File([], "spanish.apkg")}
				config={config}
				onConfigChange={setConfig}
				csvPreview={undefined}
				csvHeaders={undefined}
			/>
			<output data-testid="config-state">{JSON.stringify(config)}</output>
		</div>
	);
}

describe("ConfigureStep", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		configureMocks.useDecks.mockReturnValue({
			data: [
				{
					id: "deck-spanish",
					name: "Spanish",
					children: [],
				},
			],
		});
	});

	it("updates CSV delimiter, header mode, field mapping, and target deck", async () => {
		const screen = await renderWithProviders(<CsvHarness />);

		await screen.getByRole("button", { name: "CSV delimiter" }).click();
		await screen.getByRole("option", { name: "Semicolon (;)" }).click();
		await expect.element(screen.getByTestId("config-state")).toHaveTextContent(
			'"delimiter":";"',
		);

		await screen.getByRole("button", { name: "Field mapping for Back" }).click();
		await screen.getByRole("option", { name: "Extra" }).click();
		await expect.element(screen.getByTestId("config-state")).toHaveTextContent(
			'"1":"Extra"',
		);

		await screen.getByLabelText("First row is header").click();
		await expect.element(screen.getByTestId("config-state")).toHaveTextContent(
			'"hasHeader":false',
		);

		await screen.getByRole("button", { name: "Existing deck" }).click();
		await screen.getByRole("option", { name: "Spanish" }).click();
		await expect.element(screen.getByTestId("config-state")).toHaveTextContent(
			'"targetDeck":"Spanish"',
		);
	});

	it("switches APKG import mode between merge and create", async () => {
		const screen = await renderWithProviders(<ApkgHarness />);

		await expect.element(screen.getByText("Package Details")).toBeVisible();
		await expect.element(screen.getByText("spanish")).toBeVisible();
		await screen.getByRole("checkbox", { name: /create new/i }).click();

		await expect.element(screen.getByTestId("config-state")).toHaveTextContent(
			'"mergeMode":"create"',
		);
	});
});
