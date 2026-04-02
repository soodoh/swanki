import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../../lib/search-parser";

describe("parseSearchQuery", () => {
	it("parses deck: filter", () => {
		const result = parseSearchQuery("deck:Japanese");
		expect(result).toStrictEqual({ type: "deck", value: "Japanese" });
	});

	it("parses tag: filter", () => {
		const result = parseSearchQuery("tag:verb");
		expect(result).toStrictEqual({ type: "tag", value: "verb" });
	});

	it("parses is:due state filter", () => {
		const result = parseSearchQuery("is:due");
		expect(result).toStrictEqual({ type: "state", value: "due" });
	});

	it("parses is:new state filter", () => {
		const result = parseSearchQuery("is:new");
		expect(result).toStrictEqual({ type: "state", value: "new" });
	});

	it("parses is:review state filter", () => {
		const result = parseSearchQuery("is:review");
		expect(result).toStrictEqual({ type: "state", value: "review" });
	});

	it("parses quoted exact phrase", () => {
		const result = parseSearchQuery('"exact phrase"');
		expect(result).toStrictEqual({ type: "text", value: "exact phrase" });
	});

	it("parses negation with -", () => {
		const result = parseSearchQuery("-tag:verb");
		expect(result).toStrictEqual({
			type: "negate",
			child: { type: "tag", value: "verb" },
		});
	});

	it("parses multiple terms as AND", () => {
		const result = parseSearchQuery("deck:Japanese tag:verb");
		expect(result).toStrictEqual({
			type: "and",
			children: [
				{ type: "deck", value: "Japanese" },
				{ type: "tag", value: "verb" },
			],
		});
	});

	it("parses OR groups in parentheses", () => {
		const result = parseSearchQuery("(tag:verb OR tag:noun)");
		expect(result).toStrictEqual({
			type: "or",
			children: [
				{ type: "tag", value: "verb" },
				{ type: "tag", value: "noun" },
			],
		});
	});

	it("parses plain text as text node", () => {
		const result = parseSearchQuery("hello");
		expect(result).toStrictEqual({ type: "text", value: "hello" });
	});

	it("parses mixed filters and text as AND", () => {
		const result = parseSearchQuery("deck:JP hello");
		expect(result).toStrictEqual({
			type: "and",
			children: [
				{ type: "deck", value: "JP" },
				{ type: "text", value: "hello" },
			],
		});
	});

	it("returns text node for empty query", () => {
		const result = parseSearchQuery("");
		expect(result).toStrictEqual({ type: "text", value: "" });
	});

	it("handles whitespace-only query", () => {
		const result = parseSearchQuery("   ");
		expect(result).toStrictEqual({ type: "text", value: "" });
	});

	it("handles deck with quoted value containing spaces", () => {
		const result = parseSearchQuery('deck:"My Deck"');
		expect(result).toStrictEqual({ type: "deck", value: "My Deck" });
	});

	it("handles negated deck filter", () => {
		const result = parseSearchQuery("-deck:Japanese");
		expect(result).toStrictEqual({
			type: "negate",
			child: { type: "deck", value: "Japanese" },
		});
	});

	it("handles complex query with negation, OR, and text", () => {
		const result = parseSearchQuery("deck:JP -tag:verb hello");
		expect(result).toStrictEqual({
			type: "and",
			children: [
				{ type: "deck", value: "JP" },
				{ type: "negate", child: { type: "tag", value: "verb" } },
				{ type: "text", value: "hello" },
			],
		});
	});

	it("handles OR without parentheses between two terms", () => {
		const result = parseSearchQuery("tag:verb OR tag:noun");
		expect(result).toStrictEqual({
			type: "or",
			children: [
				{ type: "tag", value: "verb" },
				{ type: "tag", value: "noun" },
			],
		});
	});
});
