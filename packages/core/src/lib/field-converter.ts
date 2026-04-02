/**
 * Converts Anki HTML field content to plain text + media references.
 *
 * Fields in the new format store only:
 * - Plain escaped text
 * - Media references: [image:file], [audio:file], [video:file]
 *
 * All other HTML formatting is stripped since styling is now handled
 * by the card template WYSIWYG editor.
 */

/**
 * Strip HTML from field content, preserving media bracket tags and plain text.
 *
 * Bracket media tags ([image:], [audio:], [video:]) are preserved as-is.
 * All HTML (including <img>, <video>, <audio>) is stripped to plain text.
 */
export function stripHtmlToPlainText(html: string): string {
	if (!html) {
		return "";
	}

	let result = "";
	let remaining = html;

	while (remaining.length > 0) {
		// Check for bracket media tags — preserve [image:], [audio:], [video:]
		const bracketMatch = remaining.match(/^\[(?:image|audio|video):[^\]]+\]/);
		if (bracketMatch) {
			result += bracketMatch[0];
			remaining = remaining.slice(bracketMatch[0].length);
			continue;
		}

		// Check for [sound:] tags (legacy Anki format) — preserve as [audio:]
		// This handles raw Anki fields before rewriteMediaUrls has run
		const soundMatch = remaining.match(/^\[sound:([^\]]+)\]/);
		if (soundMatch) {
			result += soundMatch[0];
			remaining = remaining.slice(soundMatch[0].length);
			continue;
		}

		// Check for <br> tags — convert to space
		const brMatch = remaining.match(/^<br\s*\/?>/i);
		if (brMatch) {
			result += " ";
			remaining = remaining.slice(brMatch[0].length);
			continue;
		}

		// Check for block closing tags that imply paragraph boundaries
		const blockCloseMatch = remaining.match(
			/^<\/(div|p|table|tr|li|ul|ol|blockquote)>/i,
		);
		if (blockCloseMatch) {
			result += " ";
			remaining = remaining.slice(blockCloseMatch[0].length);
			continue;
		}

		// Skip other HTML tags (including <img>, <video>, <audio>)
		const tagMatch = remaining.match(/^<[^>]+>/);
		if (tagMatch) {
			remaining = remaining.slice(tagMatch[0].length);
			continue;
		}

		// Find the next tag boundary
		const nextTag = remaining.indexOf("<");
		const nextBracket = remaining.indexOf("[");
		let nextBoundary = remaining.length;
		if (nextTag !== -1) {
			nextBoundary = Math.min(nextBoundary, nextTag);
		}
		if (nextBracket !== -1) {
			nextBoundary = Math.min(nextBoundary, nextBracket);
		}

		const textChunk = remaining.slice(0, nextBoundary);
		if (textChunk) {
			result += decodeEntities(textChunk);
		}

		remaining = remaining.slice(nextBoundary);
	}

	// Clean up excessive whitespace but preserve single spaces
	return result.replace(/ {2,}/g, " ").trim();
}

function decodeEntities(text: string): string {
	let result = text;
	result = result.replace(/&amp;/g, "&");
	result = result.replace(/&lt;/g, "<");
	result = result.replace(/&gt;/g, ">");
	result = result.replace(/&quot;/g, '"');
	result = result.replace(/&#39;/g, "'");
	result = result.replace(/&nbsp;/g, " ");
	return result;
}
