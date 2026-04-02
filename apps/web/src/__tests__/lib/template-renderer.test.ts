import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../lib/template-renderer";

describe("renderTemplate", () => {
	it("basic substitution", () => {
		expect(renderTemplate("{{Front}}", { Front: "hello" })).toBe("hello");
	});

	it("multiple fields", () => {
		expect(
			renderTemplate("{{Front}} - {{Back}}", { Front: "Q", Back: "A" }),
		).toBe("Q - A");
	});

	it("missing field renders empty", () => {
		expect(renderTemplate("{{Front}} {{Missing}}", { Front: "hello" })).toBe(
			"hello ",
		);
	});

	it("HTML in fields preserved", () => {
		expect(renderTemplate("{{Front}}", { Front: "<b>bold</b>" })).toBe(
			"<b>bold</b>",
		);
	});

	it("conditional shown when field non-empty", () => {
		expect(
			renderTemplate("{{#Hint}}Hint: {{Hint}}{{/Hint}}", { Hint: "clue" }),
		).toBe("Hint: clue");
	});

	it("conditional hidden when field empty", () => {
		expect(
			renderTemplate("{{#Hint}}Hint: {{Hint}}{{/Hint}}", { Hint: "" }),
		).toBe("");
	});

	it("conditional hidden when field missing", () => {
		expect(renderTemplate("{{#Hint}}Hint: {{Hint}}{{/Hint}}", {})).toBe("");
	});

	it("FrontSide substitution", () => {
		expect(
			renderTemplate(
				"{{FrontSide}}<hr>{{Back}}",
				{ Back: "answer" },
				{
					frontSide: "question",
				},
			),
		).toBe("question<hr>answer");
	});

	it("cloze question (card 1) replaces active deletion with [...]", () => {
		const result = renderTemplate(
			"{{cloze:Text}}",
			{ Text: "The {{c1::capital}} of France" },
			{ cardOrdinal: 1 },
		);
		expect(result).toBe("The [...] of France");
	});

	it("cloze answer (card 1) shows the answer text", () => {
		const result = renderTemplate(
			"{{cloze:Text}}",
			{ Text: "The {{c1::capital}} of France" },
			{ cardOrdinal: 1, showAnswer: true },
		);
		expect(result).toContain("capital");
		// Should not contain the cloze markup
		expect(result).not.toContain("{{c1::");
		expect(result).not.toContain("}}");
	});

	it("cloze with hint shows [hint] on question", () => {
		const result = renderTemplate(
			"{{cloze:Text}}",
			{ Text: "The {{c1::capital::city type}} of France" },
			{ cardOrdinal: 1 },
		);
		expect(result).toBe("The [city type] of France");
	});

	it("cloze with multiple deletions, only active ones hidden", () => {
		const result = renderTemplate(
			"{{cloze:Text}}",
			{ Text: "{{c1::Paris}} is the {{c2::capital}} of {{c1::France}}" },
			{ cardOrdinal: 1 },
		);
		expect(result).toBe("[...] is the capital of [...]");
	});

	it("nested conditionals", () => {
		expect(
			renderTemplate("{{#Front}}{{#Back}}Both exist{{/Back}}{{/Front}}", {
				Front: "yes",
				Back: "yes",
			}),
		).toBe("Both exist");
	});
});
