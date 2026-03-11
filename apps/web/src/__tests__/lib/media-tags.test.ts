import { describe, it, expect } from "vitest";
import { expandMediaTags } from "@/lib/media-tags";
import { sanitizeHtml } from "@/lib/sanitize";

describe("expandMediaTags", () => {
  it("converts [audio:] to a play button + hidden audio", () => {
    const result = expandMediaTags("[audio:abc.mp3]");
    expect(result).toContain('<audio src="/api/media/abc.mp3"');
    expect(result).toContain('class="sound-btn"');
    expect(result).toContain('class="sound-player"');
    expect(result).not.toContain("[audio:");
  });

  it("converts [image:] to an img tag", () => {
    const result = expandMediaTags("[image:test.jpg]");
    expect(result).toBe('<img src="/api/media/test.jpg">');
  });

  it("converts [video:] to a video tag", () => {
    const result = expandMediaTags("[video:clip.mp4]");
    expect(result).toBe('<video src="/api/media/clip.mp4" controls></video>');
  });

  it("converts multiple media tags", () => {
    const input = "[image:a.jpg] some text [audio:b.mp3]";
    const result = expandMediaTags(input);
    expect(result).toContain('<img src="/api/media/a.jpg">');
    expect(result).toContain('<audio src="/api/media/b.mp3"');
    expect(result).toContain("some text");
  });

  it("preserves surrounding HTML", () => {
    const input = "<p>Hello</p>[audio:x.mp3]<p>World</p>";
    const result = expandMediaTags(input);
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
    expect(result).toContain('<audio src="/api/media/x.mp3"');
  });

  it("returns input unchanged when no media tags present", () => {
    const input = "<p>No media here</p>";
    expect(expandMediaTags(input)).toBe(input);
  });

  it("output survives when run after sanitizeHtml", () => {
    // expandMediaTags runs AFTER sanitizeHtml — bracket tags are plain text to DOMPurify
    const sanitized = sanitizeHtml("some text [audio:test.mp3] more text");
    const result = expandMediaTags(sanitized);
    expect(result).toContain("<audio");
    expect(result).toContain('src="/api/media/test.mp3"');
    expect(result).toContain("sound-btn");
    expect(result).toContain("<button");
  });
});
