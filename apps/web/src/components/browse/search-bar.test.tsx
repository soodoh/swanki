import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SearchBar } from "./search-bar";

describe("SearchBar", () => {
	it("renders with the initial value", async () => {
		const screen = await render(
			<SearchBar
				value="deck:Spanish"
				onChange={() => {}}
				onSubmit={() => {}}
			/>,
		);

		const input = screen.getByPlaceholder("Search notes");
		await expect.element(input).toHaveValue("deck:Spanish");
	});

	it("typing updates input and fires onChange", async () => {
		const onChange = vi.fn();

		const screen = await render(
			<SearchBar value="" onChange={onChange} onSubmit={() => {}} />,
		);

		const input = screen.getByPlaceholder("Search notes");
		await input.fill("hello");

		await expect.element(input).toHaveValue("hello");
		expect(onChange).toHaveBeenCalled();
	});

	it("pressing Enter fires onSubmit with current value", async () => {
		const onSubmit = vi.fn();

		const screen = await render(
			<SearchBar value="" onChange={() => {}} onSubmit={onSubmit} />,
		);

		const input = screen.getByPlaceholder("Search notes");
		await input.fill("tag:verb");
		await input.click();
		await userEvent.keyboard("{Enter}");

		expect(onSubmit).toHaveBeenCalledWith("tag:verb");
	});

	it("clicking Search button fires onSubmit", async () => {
		const onSubmit = vi.fn();

		const screen = await render(
			<SearchBar value="is:new" onChange={() => {}} onSubmit={onSubmit} />,
		);

		await screen.getByRole("button", { name: "Search" }).click();
		expect(onSubmit).toHaveBeenCalledWith("is:new");
	});

	it("syncs when external value prop changes", async () => {
		const onChange = vi.fn();

		const result = await render(
			<SearchBar value="old" onChange={onChange} onSubmit={() => {}} />,
		);

		const input = result.getByPlaceholder("Search notes");
		await expect.element(input).toHaveValue("old");

		result.rerender(
			<SearchBar value="new-value" onChange={onChange} onSubmit={() => {}} />,
		);

		await expect.element(input).toHaveValue("new-value");
	});
});
