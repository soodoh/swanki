import { describe, it, expect } from "vitest";
import { stripHtmlToPlainText } from "../../../lib/wysiwyg/field-converter";

describe("stripHtmlToPlainText", () => {
  it("returns empty string for empty input", () => {
    expect(stripHtmlToPlainText("")).toBe("");
  });

  it("passes through plain text unchanged", () => {
    expect(stripHtmlToPlainText("hello world")).toBe("hello world");
  });

  it("strips bold and italic tags", () => {
    expect(stripHtmlToPlainText("<b>bold</b> and <i>italic</i>")).toBe(
      "bold and italic",
    );
  });

  it("strips nested HTML tags", () => {
    expect(
      stripHtmlToPlainText(
        '<div><p><span style="color:red">text</span></p></div>',
      ),
    ).toBe("text");
  });

  it("preserves img tags", () => {
    const input = 'text <img src="/api/media/test.jpg"> more text';
    expect(stripHtmlToPlainText(input)).toBe(
      'text <img src="/api/media/test.jpg"> more text',
    );
  });

  it("preserves [sound:] tags", () => {
    const input = "word [sound:/api/media/audio.mp3] definition";
    expect(stripHtmlToPlainText(input)).toBe(
      "word [sound:/api/media/audio.mp3] definition",
    );
  });

  it("preserves video tags", () => {
    const input = '<video src="/api/media/test.mp4" controls></video>';
    expect(stripHtmlToPlainText(input)).toBe(input);
  });

  it("converts <br> to space", () => {
    expect(stripHtmlToPlainText("line1<br>line2")).toBe("line1 line2");
  });

  it("converts block closing tags to space", () => {
    expect(stripHtmlToPlainText("<div>a</div><div>b</div>")).toBe("a b");
  });

  it("decodes HTML entities", () => {
    expect(stripHtmlToPlainText("&amp; &lt; &gt; &quot; &#39;")).toBe(
      "& < > \" '",
    );
  });

  it("collapses multiple spaces", () => {
    expect(stripHtmlToPlainText("a   b    c")).toBe("a b c");
  });

  it("handles complex Anki field content", () => {
    const input =
      '<span style="color: blue;">The capital</span> of <b>France</b> is <img src="/api/media/paris.jpg">';
    const result = stripHtmlToPlainText(input);
    expect(result).toBe(
      'The capital of France is <img src="/api/media/paris.jpg">',
    );
  });
});
