import { describe, it, expect } from "vitest";
import { rewriteMediaUrls } from "@/lib/services/import-service";

describe("rewriteMediaUrls", () => {
  const mapping = new Map<string, string>([
    ["image.jpg", "/api/media/abc123.jpg"],
    ["sound.mp3", "/api/media/def456.mp3"],
  ]);

  it("should rewrite img src attributes", () => {
    const input = '<img src="image.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe(
      '<img src="/api/media/abc123.jpg">',
    );
  });

  it("should rewrite Anki sound syntax", () => {
    const input = "[sound:sound.mp3]";
    expect(rewriteMediaUrls(input, mapping)).toBe(
      "[sound:/api/media/def456.mp3]",
    );
  });

  it("should handle multiple media references in one field", () => {
    const input = '<img src="image.jpg"> and [sound:sound.mp3]';
    const expected =
      '<img src="/api/media/abc123.jpg"> and [sound:/api/media/def456.mp3]';
    expect(rewriteMediaUrls(input, mapping)).toBe(expected);
  });

  it("should leave non-media text unchanged", () => {
    const input = "Plain text with no media";
    expect(rewriteMediaUrls(input, mapping)).toBe(input);
  });

  it("should leave unrecognized filenames unchanged", () => {
    const input = '<img src="unknown.jpg">';
    expect(rewriteMediaUrls(input, mapping)).toBe(input);
  });
});
