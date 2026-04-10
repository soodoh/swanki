import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CustomStudyDialog } from "./custom-study-dialog";

vi.mock("@/components/ui/dialog", async () => {
	const React = await import("react");

	type DialogContextValue = {
		open: boolean;
		setOpen: (open: boolean) => void;
	};

	const DialogContext = React.createContext<DialogContextValue | null>(null);

	return {
		Dialog: ({
			children,
			open,
			onOpenChange,
		}: {
			children: React.ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}): ReactElement => {
			const [internalOpen, setInternalOpen] = React.useState(open ?? false);
			const isOpen = open ?? internalOpen;

			return (
				<DialogContext.Provider
					value={{
						open: isOpen,
						setOpen(nextOpen) {
							onOpenChange?.(nextOpen);
							if (open === undefined) {
								setInternalOpen(nextOpen);
							}
						},
					}}
				>
					{children}
				</DialogContext.Provider>
			);
		},
		DialogTrigger: ({
			render,
		}: {
			render: ReactElement;
		}): ReactElement => {
			const context = React.useContext(DialogContext);

			if (!context) {
				throw new Error("DialogTrigger must be used within Dialog");
			}

			return React.cloneElement(render, {
				onClick: () => context.setOpen(true),
			});
		},
		DialogContent: ({
			children,
		}: {
			children: React.ReactNode;
		}): ReactElement | null => {
			const context = React.useContext(DialogContext);

			return context?.open ? <div>{children}</div> : null;
		},
		DialogDescription: ({
			children,
		}: {
			children: React.ReactNode;
		}): ReactElement => <p>{children}</p>,
		DialogFooter: ({
			children,
		}: {
			children: React.ReactNode;
		}): ReactElement => <div>{children}</div>,
		DialogHeader: ({
			children,
		}: {
			children: React.ReactNode;
		}): ReactElement => <div>{children}</div>,
		DialogTitle: ({
			children,
		}: {
			children: React.ReactNode;
		}): ReactElement => <h2>{children}</h2>,
	};
});

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

describe("CustomStudyDialog", () => {
	it("starts a study-ahead session and closes the dialog", async () => {
		const onStart = vi.fn();

		const screen = await renderWithProviders(
			<CustomStudyDialog onStart={onStart} />,
		);

		await expect.element(
			screen.getByRole("button", { name: "Custom Study" }),
		).toBeVisible();

		await screen.getByRole("button", { name: "Custom Study" }).click();

		await expect
			.element(screen.getByRole("heading", { name: "Custom Study Session" }))
			.toBeVisible();
		await expect
			.element(screen.getByText("Configure a custom study session with modified settings."))
			.toBeVisible();

		await screen.getByLabelText("Days ahead").fill("7");

		await screen.getByRole("button", { name: "Start Session" }).click();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onStart).toHaveBeenCalledWith({
			studyAhead: 7,
		});
		expect(document.body.textContent ?? "").not.toContain("Custom Study Session");
	});

	it("submits the extra-new mode payload", async () => {
		const onStart = vi.fn();

		const screen = await renderWithProviders(
			<CustomStudyDialog onStart={onStart} />,
		);

		await screen.getByRole("button", { name: "Custom Study" }).click();
		screen
			.getByRole("radio", { name: "Increase today's new card limit" })
			.element()
			.click();
		await screen.getByLabelText("Extra new cards").fill("25");
		screen.getByRole("button", { name: "Start Session" }).element().click();

		expect(onStart).toHaveBeenCalledWith({
			extraNewCards: 25,
		});
	});

	it("submits the tag mode payload with preview mode enabled", async () => {
		const onStart = vi.fn();

		const screen = await renderWithProviders(
			<CustomStudyDialog onStart={onStart} />,
		);

		await screen.getByRole("button", { name: "Custom Study" }).click();
		screen.getByRole("radio", { name: "Review by tag" }).element().click();
		await screen.getByLabelText("Tag name").fill("verbs");
		screen
			.getByLabelText("Preview mode (don't affect scheduling)")
			.element()
			.click();
		screen.getByRole("button", { name: "Start Session" }).element().click();

		expect(onStart).toHaveBeenCalledWith({
			tag: "verbs",
			previewMode: true,
		});
	});
});
