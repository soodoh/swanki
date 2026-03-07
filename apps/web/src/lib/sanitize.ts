import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize HTML to prevent XSS attacks from imported card content.
 * Allows safe HTML formatting used by Anki cards (bold, italic, images, audio, inline styles)
 * but strips scripts, event handlers, iframes, and dangerous elements.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["audio", "source"],
    ADD_ATTR: ["controls"],
  });
}

/**
 * Sanitize CSS to prevent style tag breakout attacks.
 * A closing style tag sequence in CSS can terminate the style element
 * and allow injection of arbitrary HTML. This escapes such sequences.
 */
export function sanitizeCss(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}
