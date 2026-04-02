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
 * Sanitize CSS to prevent style tag breakout attacks.
 */
export function sanitizeCss(css: string): string {
	// Escape closing style tag sequences to prevent style tag breakout
	return css.split(/<\/style/gi).join(String.raw`<\/style`);
}
