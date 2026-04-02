import { describe, expect, expectTypeOf, it } from "vitest";
import { parseCsv } from "../../../lib/import/csv-parser";

describe("parseCsv", () => {
	it("parses CSV with comma delimiter", () => {
		const text = "front,back\nhello,world\nfoo,bar";
		const result = parseCsv(text, { hasHeader: true });

		expect(result.headers).toStrictEqual(["front", "back"]);
		expect(result.rows).toStrictEqual([
			["hello", "world"],
			["foo", "bar"],
		]);
	});

	it("parses TSV with tab delimiter", () => {
		const text = "front\tback\nhello\tworld\nfoo\tbar";
		const result = parseCsv(text, { delimiter: "\t", hasHeader: true });

		expect(result.headers).toStrictEqual(["front", "back"]);
		expect(result.rows).toStrictEqual([
			["hello", "world"],
			["foo", "bar"],
		]);
	});

	it("handles quoted fields with embedded commas", () => {
		const text = '"has, comma",normal\n"another, one",plain';
		const result = parseCsv(text);

		expect(result.rows).toStrictEqual([
			["has, comma", "normal"],
			["another, one", "plain"],
		]);
	});

	it("handles quoted fields with embedded newlines", () => {
		const text = '"line1\nline2",value\nsimple,data';
		const result = parseCsv(text);

		expect(result.rows).toStrictEqual([
			["line1\nline2", "value"],
			["simple", "data"],
		]);
	});

	it("handles escaped quotes within quoted fields", () => {
		const text = '"say ""hello""",world';
		const result = parseCsv(text);

		expect(result.rows).toStrictEqual([['say "hello"', "world"]]);
	});

	it("detects header row when hasHeader is true", () => {
		const text = "Question,Answer\nWhat is 1+1?,2";
		const result = parseCsv(text, { hasHeader: true });

		expect(result.headers).toStrictEqual(["Question", "Answer"]);
		expect(result.rows).toStrictEqual([["What is 1+1?", "2"]]);
	});

	it("returns undefined headers when hasHeader is false or unset", () => {
		const text = "hello,world\nfoo,bar";
		const result = parseCsv(text);

		expect(result.headers).toBeUndefined();
		expect(result.rows).toStrictEqual([
			["hello", "world"],
			["foo", "bar"],
		]);
	});

	it("returns array of string arrays", () => {
		const text = "a,b,c\n1,2,3";
		const result = parseCsv(text);

		expect(Array.isArray(result.rows)).toBe(true);
		for (const row of result.rows) {
			expect(Array.isArray(row)).toBe(true);
			for (const cell of row) {
				expectTypeOf(cell).toBeString();
			}
		}
	});

	it("supports custom delimiter", () => {
		const text = "front;back\nhello;world";
		const result = parseCsv(text, { delimiter: ";", hasHeader: true });

		expect(result.headers).toStrictEqual(["front", "back"]);
		expect(result.rows).toStrictEqual([["hello", "world"]]);
	});

	it("handles empty input", () => {
		const result = parseCsv("");
		expect(result.rows).toStrictEqual([]);
		expect(result.headers).toBeUndefined();
	});

	it("trims trailing newlines", () => {
		const text = "a,b\nc,d\n";
		const result = parseCsv(text);

		expect(result.rows).toStrictEqual([
			["a", "b"],
			["c", "d"],
		]);
	});

	it("handles single column CSV", () => {
		const text = "word\nhello\nworld";
		const result = parseCsv(text, { hasHeader: true });

		expect(result.headers).toStrictEqual(["word"]);
		expect(result.rows).toStrictEqual([["hello"], ["world"]]);
	});
});
