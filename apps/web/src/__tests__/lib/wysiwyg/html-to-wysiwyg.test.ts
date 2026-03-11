import { describe, it, expect } from "vitest";
import {
  parseCssRules,
  resolveCardStyles,
  convertHtmlToDoc,
  convertAnkiTemplate,
} from "../../../lib/wysiwyg/html-to-wysiwyg";

describe("parseCssRules", () => {
  it("parses basic CSS rules", () => {
    const rules = parseCssRules(".card { color: red; font-size: 20px; }");
    expect(rules.get(".card")).toStrictEqual({
      color: "red",
      "font-size": "20px",
    });
  });

  it("handles multiple selectors", () => {
    const rules = parseCssRules(
      ".card { color: blue; }\n.card1 { font-weight: bold; }",
    );
    expect(rules.get(".card")).toStrictEqual({ color: "blue" });
    expect(rules.get(".card1")).toStrictEqual({ "font-weight": "bold" });
  });

  it("handles comma-separated selectors", () => {
    const rules = parseCssRules(".card, .card1 { color: green; }");
    expect(rules.get(".card")).toStrictEqual({ color: "green" });
    expect(rules.get(".card1")).toStrictEqual({ color: "green" });
  });

  it("strips CSS comments", () => {
    const rules = parseCssRules(
      "/* comment */ .card { color: red; /* inline */ }",
    );
    expect(rules.get(".card")).toStrictEqual({ color: "red" });
  });

  it("returns empty map for empty CSS", () => {
    expect(parseCssRules("").size).toBe(0);
    expect(parseCssRules("   ").size).toBe(0);
  });
});

describe("resolveCardStyles", () => {
  it("resolves .card styles", () => {
    const rules = parseCssRules(
      ".card { color: white; background-color: #333; font-family: serif; }",
    );
    const style = resolveCardStyles(rules);
    expect(style.color).toBe("white");
    expect(style.backgroundColor).toBe("#333");
    expect(style.fontFamily).toBe("serif");
  });

  it("merges card-specific styles with base", () => {
    const rules = parseCssRules(
      ".card { color: white; } .card1 { color: red; }",
    );
    const style = resolveCardStyles(rules, 0);
    expect(style.color).toBe("red");
  });

  it("falls back to .card when no card-specific rule", () => {
    const rules = parseCssRules(".card { font-size: 24px; }");
    const style = resolveCardStyles(rules, 0);
    expect(style.fontSize).toBe("24px");
  });
});

describe("convertHtmlToDoc", () => {
  it("converts plain text with field reference", () => {
    const doc = convertHtmlToDoc("{{Front}}");
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(1);
    const para = doc.content![0];
    expect(para.type).toBe("paragraph");
    expect(para.content).toHaveLength(1);
    expect(para.content![0].type).toBe("fieldReference");
    expect(para.content![0].attrs?.fieldName).toBe("Front");
  });

  it("converts text with multiple field references", () => {
    const doc = convertHtmlToDoc("Q: {{Front}} A: {{Back}}");
    expect(doc.content).toHaveLength(1);
    const paraContent = doc.content![0].content!;
    expect(paraContent).toHaveLength(4);
    expect(paraContent[0]).toStrictEqual({ type: "text", text: "Q: " });
    expect(paraContent[1].type).toBe("fieldReference");
    expect(paraContent[2]).toStrictEqual({ type: "text", text: " A: " });
    expect(paraContent[3].type).toBe("fieldReference");
  });

  it("converts FrontSide reference", () => {
    const doc = convertHtmlToDoc("{{FrontSide}}<hr>{{Back}}");
    expect(doc.content!.length).toBeGreaterThanOrEqual(3);
    // Should have: paragraph(FrontSide), hr, paragraph(Back)
    expect(doc.content![0].content![0].type).toBe("frontSideReference");
    expect(doc.content![1].type).toBe("horizontalRule");
  });

  it("converts cloze reference", () => {
    const doc = convertHtmlToDoc("{{cloze:Text}}");
    const para = doc.content![0];
    expect(para.content![0].type).toBe("clozeField");
    expect(para.content![0].attrs?.fieldName).toBe("Text");
  });

  it("handles <br> as line breaks", () => {
    const doc = convertHtmlToDoc("Line 1<br>Line 2");
    // <br> splits into separate paragraphs
    expect(doc.content!).toHaveLength(2);
  });

  it("handles bold and italic tags", () => {
    const doc = convertHtmlToDoc("<b>bold</b> and <i>italic</i>");
    const para = doc.content![0];
    const boldText = para.content![0];
    expect(boldText.text).toBe("bold");
    expect(boldText.marks).toStrictEqual([{ type: "bold" }]);
    const italicText = para.content![2];
    expect(italicText.text).toBe("italic");
    expect(italicText.marks).toStrictEqual([{ type: "italic" }]);
  });

  it("creates empty paragraph for empty HTML", () => {
    const doc = convertHtmlToDoc("");
    expect(doc.content).toHaveLength(1);
    expect(doc.content![0].type).toBe("paragraph");
  });

  it("strips inline SVG elements", () => {
    const html = `<div class="type">Flag</div>
<div class="value">
  <svg class="placeholder" xmlns="http://www.w3.org/2000/svg" width="417" height="250" viewBox="0 0 417 250">
    <path d="m2 26s45-24 129-24c86 0 146 25 210 25" />
  </svg>
</div>`;
    const doc = convertHtmlToDoc(html);
    // SVG should be stripped; only the "Flag" text paragraph should remain
    const texts = doc
      .content!.flatMap((p) => p.content ?? [])
      .filter((n) => n.type === "text")
      .map((n) => n.text);
    expect(texts).toStrictEqual(["Flag"]);
    // No SVG attribute text should appear
    const allText = texts.join(" ");
    expect(allText).not.toContain("svg");
    expect(allText).not.toContain("viewBox");
  });
});

describe("convertAnkiTemplate", () => {
  it("produces a valid WysiwygTemplate", () => {
    const result = convertAnkiTemplate("{{Front}}", ".card { color: red; }");
    expect(result.version).toBe(1);
    expect(result.doc.type).toBe("doc");
    expect(result.doc.attrs?.cardStyle).toStrictEqual({ color: "red" });
  });

  it("handles empty CSS", () => {
    const result = convertAnkiTemplate("{{Front}}", "");
    expect(result.version).toBe(1);
    expect(result.doc.attrs?.cardStyle).toBeUndefined();
  });

  it("resolves card-specific CSS", () => {
    const result = convertAnkiTemplate(
      "{{Front}}",
      ".card { color: white; } .card1 { color: blue; }",
      0,
    );
    const cardStyle = result.doc.attrs?.cardStyle as Record<string, string>;
    expect(cardStyle.color).toBe("blue");
  });
});
