import { describe, it, expect } from "vitest";
import { renderWysiwygTemplate } from "../../../lib/wysiwyg/wysiwyg-to-html";
import type { TemplateNode } from "../../../lib/wysiwyg/types";

function makeDoc(...content: TemplateNode[]): TemplateNode {
  return { type: "doc", content };
}

function makePara(...content: TemplateNode[]): TemplateNode {
  return { type: "paragraph", content };
}

function makeText(text: string): TemplateNode {
  return { type: "text", text };
}

function makeField(fieldName: string): TemplateNode {
  return { type: "fieldReference", attrs: { fieldName } };
}

function makeFrontSide(): TemplateNode {
  return { type: "frontSideReference" };
}

function makeCloze(fieldName: string): TemplateNode {
  return { type: "clozeField", attrs: { fieldName } };
}

describe("renderWysiwygTemplate", () => {
  it("renders a basic field reference", () => {
    const doc = makeDoc(makePara(makeField("Front")));
    const html = renderWysiwygTemplate(doc, { Front: "hello" });
    expect(html).toBe("<p>hello</p>");
  });

  it("renders multiple fields", () => {
    const doc = makeDoc(
      makePara(makeField("Front"), makeText(" - "), makeField("Back")),
    );
    const html = renderWysiwygTemplate(doc, { Front: "Q", Back: "A" });
    expect(html).toBe("<p>Q - A</p>");
  });

  it("renders FrontSide reference", () => {
    const doc = makeDoc(
      makeFrontSide(),
      { type: "horizontalRule" },
      makePara(makeField("Back")),
    );
    const html = renderWysiwygTemplate(
      doc,
      { Back: "answer" },
      {
        frontSide: "<p>question</p>",
      },
    );
    expect(html).toContain("<p>question</p>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<p>answer</p>");
  });

  it("renders cloze on question side", () => {
    const doc = makeDoc(makePara(makeCloze("Text")));
    const html = renderWysiwygTemplate(
      doc,
      { Text: "The {{c1::capital}} of France" },
      { cardOrdinal: 1 },
    );
    expect(html).toBe("<p>The [...] of France</p>");
  });

  it("renders cloze on answer side", () => {
    const doc = makeDoc(makePara(makeCloze("Text")));
    const html = renderWysiwygTemplate(
      doc,
      { Text: "The {{c1::capital}} of France" },
      { cardOrdinal: 1, showAnswer: true },
    );
    expect(html).toContain("capital");
    expect(html).toContain('class="cloze"');
  });

  it("renders bold marks", () => {
    const doc = makeDoc(
      makePara({
        type: "text",
        text: "bold text",
        marks: [{ type: "bold" }],
      }),
    );
    const html = renderWysiwygTemplate(doc, {});
    expect(html).toBe("<p><strong>bold text</strong></p>");
  });

  it("renders card styles", () => {
    const doc = makeDoc(makePara(makeField("Front")));
    doc.attrs = { cardStyle: { color: "red", fontSize: "24px" } };
    const html = renderWysiwygTemplate(doc, { Front: "hello" });
    expect(html).toContain('style="color: red; font-size: 24px"');
    expect(html).toContain("hello");
  });

  it("escapes HTML in field values", () => {
    const doc = makeDoc(makePara(makeField("Front")));
    const html = renderWysiwygTemplate(doc, {
      Front: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders horizontal rule", () => {
    const doc = makeDoc(
      makePara(makeText("before")),
      { type: "horizontalRule" },
      makePara(makeText("after")),
    );
    const html = renderWysiwygTemplate(doc, {});
    expect(html).toBe("<p>before</p><hr><p>after</p>");
  });

  it("renders image node", () => {
    const doc = makeDoc(
      makePara({
        type: "image",
        attrs: { src: "/api/media/test.jpg" },
      }),
    );
    const html = renderWysiwygTemplate(doc, {});
    expect(html).toContain('<img src="/api/media/test.jpg">');
  });

  it("handles missing fields gracefully", () => {
    const doc = makeDoc(makePara(makeField("Missing")));
    const html = renderWysiwygTemplate(doc, {});
    expect(html).toBe("<p></p>");
  });
});
