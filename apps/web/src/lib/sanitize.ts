import { sanitize } from "isomorphic-dompurify";

/**
 * Sanitize HTML to prevent XSS attacks from imported card content.
 * Allows safe HTML formatting used by Anki cards (bold, italic, inline styles)
 * but strips scripts, event handlers, iframes, and dangerous elements.
 *
 * Media bracket tags ([image:], [audio:], [video:]) pass through as plain text.
 * expandMediaTags() converts them to HTML elements AFTER sanitization.
 */
export function sanitizeHtml(html: string): string {
  return sanitize(html);
}

/**
 * Sanitize CSS to prevent style tag breakout attacks and strip Anki's
 * hardcoded `.card` colors so the app theme (via Tailwind prose classes)
 * controls card appearance in both light and dark mode.
 */
export function sanitizeCss(css: string): string {
  // Escape closing style tag sequences to prevent style tag breakout
  const escaped = css.split(/<\/style/gi).join(String.raw`<\/style`);

  // Strip `.card { ... }` rules entirely. Anki note types include a `.card`
  // rule with hardcoded colors/fonts that conflict with the app's Tailwind theme.
  const stripped = escaped.split(/\.card\s*\{[^}]*\}/g).join("");

  return stripped;
}
