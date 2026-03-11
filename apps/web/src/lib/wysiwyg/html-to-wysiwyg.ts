/**
 * Converts Anki-style HTML templates (with mustache syntax) into
 * WYSIWYG template JSON documents, resolving CSS to inline styles.
 */
import type {
  TemplateNode,
  TemplateMark,
  WysiwygTemplate,
  InlineStyle,
} from "./types";
import { CUSTOM_NODE_TYPES } from "./types";

/**
 * Parse a CSS string into a map of selector -> properties.
 * Handles basic CSS rules (no @media, no pseudo-selectors).
 */
export function parseCssRules(
  css: string,
): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  if (!css.trim()) {
    return rules;
  }

  // Remove comments
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // Match selector { properties }
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRegex.exec(cleaned)) !== null) {
    const selectors = match[1].trim();
    const body = match[2].trim();

    const props: Record<string, string> = {};
    for (const decl of body.split(";")) {
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) {
        continue;
      }
      const prop = decl.slice(0, colonIdx).trim();
      const val = decl.slice(colonIdx + 1).trim();
      if (prop && val) {
        props[prop] = val;
      }
    }

    // Split comma-separated selectors
    for (const sel of selectors.split(",")) {
      const trimmed = sel.trim();
      if (trimmed) {
        const existing = rules.get(trimmed) ?? {};
        rules.set(trimmed, { ...existing, ...props });
      }
    }
  }

  return rules;
}

/**
 * Resolve CSS rules to a flat style object for the .card class.
 * Merges styles from .card, .card1, .card2, etc.
 */
export function resolveCardStyles(
  cssRules: Map<string, Record<string, string>>,
  cardOrdinal?: number,
): InlineStyle {
  const style: InlineStyle = {};

  // Gather styles from most general to most specific
  const selectors = [".card"];
  if (cardOrdinal !== undefined) {
    selectors.push(`.card${cardOrdinal + 1}`);
  }

  for (const sel of selectors) {
    const props = cssRules.get(sel);
    if (!props) {
      continue;
    }
    if (props.color) {
      style.color = props.color;
    }
    if (props["background-color"]) {
      style.backgroundColor = props["background-color"];
    }
    if (props["font-size"]) {
      style.fontSize = props["font-size"];
    }
    if (props["font-family"]) {
      style.fontFamily = props["font-family"];
    }
    if (props["font-weight"]) {
      style.fontWeight = props["font-weight"];
    }
    if (props["font-style"]) {
      style.fontStyle = props["font-style"];
    }
    if (props["text-decoration"]) {
      style.textDecoration = props["text-decoration"];
    }
    if (props["text-align"]) {
      style.textAlign = props["text-align"];
    }
  }

  return style;
}

/** Parse inline style attribute to InlineStyle object. */
function parseInlineStyle(styleStr: string): InlineStyle {
  const style: InlineStyle = {};
  for (const decl of styleStr.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }
    const prop = decl.slice(0, colonIdx).trim();
    const val = decl.slice(colonIdx + 1).trim();
    if (prop === "color") {
      style.color = val;
    }
    if (prop === "background-color") {
      style.backgroundColor = val;
    }
    if (prop === "font-size") {
      style.fontSize = val;
    }
    if (prop === "font-family") {
      style.fontFamily = val;
    }
    if (prop === "font-weight") {
      style.fontWeight = val;
    }
    if (prop === "font-style") {
      style.fontStyle = val;
    }
    if (prop === "text-decoration") {
      style.textDecoration = val;
    }
    if (prop === "text-align") {
      style.textAlign = val;
    }
  }
  return style;
}

/**
 * Tokenize an Anki template string into a sequence of text literals
 * and mustache references.
 */
type Token =
  | { type: "text"; value: string }
  | { type: "field"; fieldName: string }
  | { type: "frontSide" }
  | { type: "cloze"; fieldName: string }
  | { type: "conditionalStart"; fieldName: string }
  | { type: "conditionalEnd"; fieldName: string };

function tokenizeTemplate(template: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\{\{(#|\/)?(?:(cloze):)?([^{}]+?)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      tokens.push({
        type: "text",
        value: template.slice(lastIndex, match.index),
      });
    }

    const prefix = match[1]; // # or /
    const clozePrefix = match[2]; // "cloze" or undefined
    const name = match[3].trim();

    if (prefix === "#") {
      tokens.push({ type: "conditionalStart", fieldName: name });
    } else if (prefix === "/") {
      tokens.push({ type: "conditionalEnd", fieldName: name });
    } else if (clozePrefix === "cloze") {
      tokens.push({ type: "cloze", fieldName: name });
    } else if (name === "FrontSide") {
      tokens.push({ type: "frontSide" });
    } else {
      tokens.push({ type: "field", fieldName: name });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({ type: "text", value: template.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Convert an HTML string (possibly containing mustache tokens) into
 * Tiptap-compatible JSON nodes.
 */
function htmlTextToNodes(text: string, marks: TemplateMark[]): TemplateNode[] {
  const nodes: TemplateNode[] = [];
  const tokens = tokenizeTemplate(text);

  for (const token of tokens) {
    if (token.type === "text") {
      if (token.value) {
        const node: TemplateNode = { type: "text", text: token.value };
        if (marks.length > 0) {
          node.marks = [...marks];
        }
        nodes.push(node);
      }
    } else if (token.type === "field") {
      nodes.push({
        type: CUSTOM_NODE_TYPES.fieldReference,
        attrs: { fieldName: token.fieldName },
      });
    } else if (token.type === "frontSide") {
      nodes.push({ type: CUSTOM_NODE_TYPES.frontSideReference });
    } else if (token.type === "cloze") {
      nodes.push({
        type: CUSTOM_NODE_TYPES.clozeField,
        attrs: { fieldName: token.fieldName },
      });
    } else if (token.type === "conditionalStart") {
      nodes.push({
        type: "text",
        text: `{{#${token.fieldName}}}`,
        marks: [{ type: "conditional", attrs: { fieldName: token.fieldName } }],
      });
    } else if (token.type === "conditionalEnd") {
      nodes.push({
        type: "text",
        text: `{{/${token.fieldName}}}`,
        marks: [{ type: "conditional", attrs: { fieldName: token.fieldName } }],
      });
    }
  }

  return nodes;
}

/**
 * Simple HTML parser that converts an Anki template's HTML into Tiptap JSON.
 */
export function convertHtmlToDoc(
  html: string,
  _cssRules?: Map<string, Record<string, string>>,
): TemplateNode {
  const doc: TemplateNode = {
    type: "doc",
    content: [],
  };

  const blocks = splitIntoBlocks(html);

  for (const block of blocks) {
    if (block.type === "hr") {
      doc.content!.push({ type: "horizontalRule" });
    } else {
      const content = parseInlineHtml(block.html);
      if (content.length > 0) {
        const para: TemplateNode = {
          type: "paragraph",
          content,
        };
        if (block.attrs && Object.keys(block.attrs).length > 0) {
          para.attrs = block.attrs;
        }
        doc.content!.push(para);
      }
    }
  }

  // If no content was generated, add an empty paragraph
  if (doc.content!.length === 0) {
    doc.content!.push({ type: "paragraph" });
  }

  return doc;
}

type BlockSegment = {
  type: "paragraph" | "hr";
  html: string;
  attrs?: Record<string, unknown>;
};

function splitIntoBlocks(html: string): BlockSegment[] {
  const blocks: BlockSegment[] = [];

  // Strip <svg>...</svg> blocks (WYSIWYG editor cannot represent inline SVGs)
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  let normalized = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  // Normalize self-closing tags
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  normalized = normalized.replace(/<br\s*\/?>/gi, "\n");
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  normalized = normalized.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  normalized = normalized.replace(/<\/?p[^>]*>/gi, "");
  // oxlint-disable-next-line unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  normalized = normalized.replace(/<\/?div[^>]*>/gi, "\n");

  // Split on <hr> tags
  const hrParts = normalized.split(/<hr\s*\/?>/gi);

  for (let i = 0; i < hrParts.length; i += 1) {
    const part = hrParts[i];

    // Split each part on double newlines for paragraph breaks
    const paragraphs = part.split(/\n\n+/);
    for (const para of paragraphs) {
      // Split single newlines into separate paragraphs (from <br>)
      const lines = para.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          blocks.push({ type: "paragraph", html: trimmed });
        }
      }
    }

    // Add <hr> between parts (not after last)
    if (i < hrParts.length - 1) {
      blocks.push({ type: "hr", html: "" });
    }
  }

  return blocks;
}

/**
 * Parse inline HTML elements into Tiptap text nodes with marks.
 */
function parseInlineHtml(html: string): TemplateNode[] {
  const nodes: TemplateNode[] = [];

  let remaining = html;
  const markStack: TemplateMark[] = [];

  while (remaining.length > 0) {
    // Check for closing tags
    const closeMatch = remaining.match(/^<\/(b|strong|i|em|u|span|sub|sup)>/i);
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      const markType = tagToMark(tag);
      if (markType) {
        const idx = findLastMarkIndex(markStack, markType);
        if (idx !== -1) {
          markStack.splice(idx, 1);
        }
      }
      remaining = remaining.slice(closeMatch[0].length);
      continue;
    }

    // Check for opening tags
    const openMatch = remaining.match(
      /^<(b|strong|i|em|u|span|sub|sup)(\s[^>]*)?\s*>/i,
    );
    if (openMatch) {
      const tag = openMatch[1].toLowerCase();
      const attrs = openMatch[2] ?? "";
      const markType = tagToMark(tag);

      if (markType) {
        const mark: TemplateMark = { type: markType };

        if (tag === "span") {
          const styleMatch = attrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const inlineStyle = parseInlineStyle(styleMatch[1]);
            if (Object.keys(inlineStyle).length > 0) {
              mark.attrs = { style: inlineStyle };
            }
          }
        }

        markStack.push(mark);
      }
      remaining = remaining.slice(openMatch[0].length);
      continue;
    }

    // Check for <img> tags (self-closing, inline)
    const imgMatch = remaining.match(/^<img\s[^>]*src="([^"]*)"[^>]*\/?>/i);
    if (imgMatch) {
      nodes.push({
        type: "image",
        attrs: { src: imgMatch[1] },
      });
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    // Skip other HTML tags we don't handle
    const otherTag = remaining.match(/^<[^>]+>/);
    if (otherTag) {
      remaining = remaining.slice(otherTag[0].length);
      continue;
    }

    // Incomplete/malformed tag at start (e.g. "<svg" with no closing ">")
    // Consume the "<" as literal text to avoid an infinite loop
    if (remaining.startsWith("<")) {
      const decoded = decodeEntities("<");
      const inlineNodes = htmlTextToNodes(decoded, [...markStack]);
      nodes.push(...inlineNodes);
      remaining = remaining.slice(1);
      continue;
    }

    // Find the next tag boundary
    const nextTag = remaining.indexOf("<");
    const textChunk = nextTag === -1 ? remaining : remaining.slice(0, nextTag);

    if (textChunk) {
      const decoded = decodeEntities(textChunk);
      const inlineNodes = htmlTextToNodes(decoded, [...markStack]);
      nodes.push(...inlineNodes);
    }

    remaining = nextTag === -1 ? "" : remaining.slice(nextTag);
  }

  return nodes;
}

function tagToMark(tag: string): string | undefined {
  const map: Record<string, string> = {
    b: "bold",
    strong: "bold",
    i: "italic",
    em: "italic",
    u: "underline",
    span: "textStyle",
    sub: "subscript",
    sup: "superscript",
  };
  return map[tag];
}

function findLastMarkIndex(marks: TemplateMark[], type: string): number {
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    if (marks[i].type === type) {
      return i;
    }
  }
  return -1;
}

/* oxlint-disable unicorn(prefer-string-replace-all), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- chained replace returns `any` in oxlint */
function decodeEntities(text: string): string {
  let result = text;
  result = result.replace(/&amp;/g, "&");
  result = result.replace(/&lt;/g, "<");
  result = result.replace(/&gt;/g, ">");
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&#39;/g, "'");
  result = result.replace(/&nbsp;/g, "\u00A0");
  return result;
}
/* oxlint-enable unicorn(prefer-string-replace-all), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) */

/**
 * Convert an Anki HTML template + CSS into a WysiwygTemplate.
 */
export function convertAnkiTemplate(
  html: string,
  css: string,
  cardOrdinal?: number,
): WysiwygTemplate {
  const cssRules = parseCssRules(css);
  const cardStyle = resolveCardStyles(cssRules, cardOrdinal);
  const doc = convertHtmlToDoc(html, cssRules);

  if (Object.keys(cardStyle).length > 0) {
    doc.attrs = { ...doc.attrs, cardStyle };
  }

  return {
    version: 1,
    doc,
  };
}
