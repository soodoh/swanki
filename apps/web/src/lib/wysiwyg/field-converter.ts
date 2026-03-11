/**
 * Converts Anki HTML field content to plain text + media references.
 *
 * Fields in the new format store only:
 * - Plain escaped text
 * - Media references: <img src="...">, [sound:...], <video src="..." controls></video>
 *
 * All other HTML formatting is stripped since styling is now handled
 * by the card template WYSIWYG editor.
 */

/**
 * Strip HTML from field content, preserving media references and plain text.
 *
 * Media tags (<img>, <audio>, <video>, [sound:]) are preserved as-is.
 * All other HTML is stripped to plain text.
 */
export function stripHtmlToPlainText(html: string): string {
  if (!html) {
    return "";
  }

  let result = "";
  let remaining = html;

  while (remaining.length > 0) {
    // Check for img tags — preserve
    const imgMatch = remaining.match(/^<img\s[^>]*src="[^"]*"[^>]*\/?>/i);
    if (imgMatch) {
      result += imgMatch[0];
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    // Check for video tags — preserve
    const videoMatch = remaining.match(
      /^<video\s[^>]*src="[^"]*"[^>]*>[\s\S]*?<\/video>/i,
    );
    if (videoMatch) {
      result += videoMatch[0];
      remaining = remaining.slice(videoMatch[0].length);
      continue;
    }

    // Check for [sound:] tags — preserve
    const soundMatch = remaining.match(/^\[sound:[^\]]+\]/);
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

    // Skip other HTML tags
    const tagMatch = remaining.match(/^<[^>]+>/);
    if (tagMatch) {
      remaining = remaining.slice(tagMatch[0].length);
      continue;
    }

    // Find the next tag boundary
    const nextTag = remaining.indexOf("<");
    const nextSound = remaining.indexOf("[sound:");
    let nextBoundary = remaining.length;
    if (nextTag !== -1) {
      nextBoundary = Math.min(nextBoundary, nextTag);
    }
    if (nextSound !== -1) {
      nextBoundary = Math.min(nextBoundary, nextSound);
    }

    const textChunk = remaining.slice(0, nextBoundary);
    if (textChunk) {
      result += decodeEntities(textChunk);
    }

    remaining = remaining.slice(nextBoundary);
  }

  // Clean up excessive whitespace but preserve single spaces
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  return result.replace(/  +/g, " ").trim();
}

/* oxlint-disable unicorn(prefer-string-replace-all), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- chained replace returns `any` in oxlint */
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
/* oxlint-enable unicorn(prefer-string-replace-all), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) */
