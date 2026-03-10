import { describe, it, expect } from "vitest";
import { replaceSoundTags } from "@/lib/sound";
import { sanitizeHtml } from "@/lib/sanitize";

describe("replaceSoundTags", () => {
  it("converts a single sound tag to a play button + hidden audio", () => {
    const result = replaceSoundTags("[sound:/api/media/abc.mp3]");
    expect(result).toContain('<audio src="/api/media/abc.mp3"');
    expect(result).toContain('class="sound-btn"');
    expect(result).toContain('class="sound-player"');
    expect(result).not.toContain("[sound:");
  });

  it("converts multiple sound tags", () => {
    const input = "[sound:/api/media/a.mp3] some text [sound:/api/media/b.mp3]";
    const result = replaceSoundTags(input);
    expect(result).toContain('<audio src="/api/media/a.mp3"');
    expect(result).toContain('<audio src="/api/media/b.mp3"');
    expect(result).toContain("some text");
  });

  it("preserves surrounding HTML", () => {
    const input = "<p>Hello</p>[sound:/api/media/x.mp3]<p>World</p>";
    const result = replaceSoundTags(input);
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
    expect(result).toContain('<audio src="/api/media/x.mp3"');
  });

  it("returns input unchanged when no sound tags present", () => {
    const input = "<p>No audio here</p>";
    expect(replaceSoundTags(input)).toBe(input);
  });

  it("output survives sanitizeHtml", () => {
    const result = replaceSoundTags("[sound:/api/media/test.mp3]");
    const sanitized = sanitizeHtml(result);
    expect(sanitized).toContain("<audio");
    expect(sanitized).toContain('src="/api/media/test.mp3"');
    expect(sanitized).toContain("sound-btn");
    expect(sanitized).toContain("<button");
  });
});
