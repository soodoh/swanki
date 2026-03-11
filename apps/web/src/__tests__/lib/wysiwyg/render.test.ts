import { describe, it, expect } from "vitest";
import {
  renderCardTemplate,
  isWysiwygTemplate,
} from "../../../lib/wysiwyg/render";
import { convertAnkiTemplate } from "../../../lib/wysiwyg/html-to-wysiwyg";

describe("isWysiwygTemplate", () => {
  it("returns true for WYSIWYG JSON", () => {
    expect(isWysiwygTemplate('{"version":1,"doc":{"type":"doc"}}')).toBe(true);
  });

  it("returns false for legacy mustache template", () => {
    expect(isWysiwygTemplate("{{Front}}")).toBe(false);
  });

  it("returns false for HTML template", () => {
    expect(isWysiwygTemplate("<div>{{Front}}</div>")).toBe(false);
  });
});

describe("renderCardTemplate", () => {
  it("renders legacy mustache template", () => {
    const html = renderCardTemplate("{{Front}}", { Front: "hello" });
    expect(html).toBe("hello");
  });

  it("renders WYSIWYG template", () => {
    const template = convertAnkiTemplate("{{Front}}", "");
    const json = JSON.stringify(template);
    const html = renderCardTemplate(json, { Front: "hello" });
    expect(html).toContain("hello");
  });

  it("renders WYSIWYG template with cloze", () => {
    const template = convertAnkiTemplate("{{cloze:Text}}", "");
    const json = JSON.stringify(template);
    const html = renderCardTemplate(
      json,
      { Text: "The {{c1::capital}} of France" },
      { cardOrdinal: 1 },
    );
    expect(html).toContain("[...]");
    expect(html).not.toContain("capital");
  });

  it("renders WYSIWYG template with CSS styles", () => {
    const template = convertAnkiTemplate("{{Front}}", ".card { color: red; }");
    const json = JSON.stringify(template);
    const html = renderCardTemplate(json, { Front: "test" });
    expect(html).toContain("color: red");
  });

  it("round-trips convert → render preserving field values", () => {
    const ankiHtml = "{{FrontSide}}<hr>{{Back}}";
    const template = convertAnkiTemplate(ankiHtml, "");
    const json = JSON.stringify(template);

    const frontTemplate = convertAnkiTemplate("{{Front}}", "");
    const frontJson = JSON.stringify(frontTemplate);
    const frontHtml = renderCardTemplate(frontJson, { Front: "question" });

    const answerHtml = renderCardTemplate(
      json,
      { Back: "answer" },
      {
        frontSide: frontHtml,
        showAnswer: true,
      },
    );
    expect(answerHtml).toContain("question");
    expect(answerHtml).toContain("answer");
    expect(answerHtml).toContain("<hr>");
  });
});
