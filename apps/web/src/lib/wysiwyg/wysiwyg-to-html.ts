/**
 * Renders a WYSIWYG template document back to HTML for display during study.
 *
 * This takes a WysiwygTemplate JSON doc and field values, and produces
 * the final HTML string with all field references substituted.
 */
import type { TemplateNode, TemplateMark, InlineStyle } from "./types";
import { CUSTOM_NODE_TYPES } from "./types";

type RenderOptions = {
  cardOrdinal?: number;
  frontSide?: string;
  showAnswer?: boolean;
};

/** Convert an InlineStyle object to a CSS style string. */
function styleToString(style: InlineStyle): string {
  const parts: string[] = [];
  if (style.color) {
    parts.push(`color: ${style.color}`);
  }
  if (style.backgroundColor) {
    parts.push(`background-color: ${style.backgroundColor}`);
  }
  if (style.fontSize) {
    parts.push(`font-size: ${style.fontSize}`);
  }
  if (style.fontFamily) {
    parts.push(`font-family: ${style.fontFamily}`);
  }
  if (style.fontWeight) {
    parts.push(`font-weight: ${style.fontWeight}`);
  }
  if (style.fontStyle) {
    parts.push(`font-style: ${style.fontStyle}`);
  }
  if (style.textDecoration) {
    parts.push(`text-decoration: ${style.textDecoration}`);
  }
  if (style.textAlign) {
    parts.push(`text-align: ${style.textAlign}`);
  }
  return parts.join("; ");
}

/**
 * Process cloze deletions in a field value.
 * Same logic as the original template-renderer.ts processCloze function.
 */
function processCloze(
  fieldValue: string,
  cardOrdinal: number,
  showAnswer: boolean,
): string {
  const clozePattern = /\{\{c(\d+)::([^}:]+)(?:::([^}]+))?\}\}/g;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = clozePattern.exec(fieldValue)) !== null) {
    result += fieldValue.slice(lastIndex, match.index);
    const ordinal = Number.parseInt(match[1], 10);
    const answer = match[2];
    const hint: string | undefined = match[3];

    if (ordinal === cardOrdinal) {
      if (showAnswer) {
        result += `<span class="cloze">${answer}</span>`;
      } else {
        result += hint ? `[${hint}]` : "[...]";
      }
    } else {
      result += answer;
    }

    lastIndex = match.index + match[0].length;
  }

  result += fieldValue.slice(lastIndex);
  return result;
}

/**
 * Render a single mark's opening tag.
 */
function openMark(mark: TemplateMark): string {
  switch (mark.type) {
    case "bold":
      return "<strong>";
    case "italic":
      return "<em>";
    case "underline":
      return "<u>";
    case "textStyle": {
      const style = mark.attrs?.style as InlineStyle | undefined;
      if (style) {
        const cssStr = styleToString(style);
        return cssStr ? `<span style="${cssStr}">` : "<span>";
      }
      return "<span>";
    }
    case "subscript":
      return "<sub>";
    case "superscript":
      return "<sup>";
    case "conditional":
      return ""; // Conditionals don't produce HTML tags
    default:
      return "";
  }
}

/** Render a single mark's closing tag. */
function closeMark(mark: TemplateMark): string {
  switch (mark.type) {
    case "bold":
      return "</strong>";
    case "italic":
      return "</em>";
    case "underline":
      return "</u>";
    case "textStyle":
      return "</span>";
    case "subscript":
      return "</sub>";
    case "superscript":
      return "</sup>";
    case "conditional":
      return "";
    default:
      return "";
  }
}

/* oxlint-disable unicorn(prefer-string-replace-all), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- chained replace returns `any` in oxlint */
/** Escape text for safe HTML insertion. */
function escapeHtml(text: string): string {
  let result = text;
  result = result.replace(/&/g, "&amp;");
  result = result.replace(/</g, "&lt;");
  result = result.replace(/>/g, "&gt;");
  result = result.replace(/"/g, "&quot;");
  return result;
}
/* oxlint-enable unicorn(prefer-string-replace-all), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) */

/** Render children of a node. */
function renderChildren(
  node: TemplateNode,
  fields: Record<string, string>,
  options: RenderOptions,
): string {
  return (node.content ?? [])
    .map((child) => renderNode(child, fields, options))
    .join("");
}

/** Render a text node with optional marks. */
function renderTextNode(node: TemplateNode): string {
  const text = escapeHtml(node.text ?? "");
  if (node.marks && node.marks.length > 0) {
    let result = text;
    for (const mark of node.marks) {
      result = `${openMark(mark)}${result}${closeMark(mark)}`;
    }
    return result;
  }
  return text;
}

/** Render a doc node, wrapping content in a styled div if needed. */
function renderDocNode(
  node: TemplateNode,
  fields: Record<string, string>,
  options: RenderOptions,
): string {
  const cardStyle = node.attrs?.cardStyle as InlineStyle | undefined;
  let html = renderChildren(node, fields, options);
  if (cardStyle && Object.keys(cardStyle).length > 0) {
    const cssStr = styleToString(cardStyle);
    html = `<div class="card" style="${cssStr}">${html}</div>`;
  }
  return html;
}

/** Render a paragraph node with optional text alignment. */
function renderParagraphNode(
  node: TemplateNode,
  fields: Record<string, string>,
  options: RenderOptions,
): string {
  const textAlign = node.attrs?.textAlign as string | undefined;
  const styleAttr = textAlign ? ` style="text-align: ${textAlign}"` : "";
  return `<p${styleAttr}>${renderChildren(node, fields, options)}</p>`;
}

/**
 * Render a template node to HTML with field substitution.
 */
function renderNode(
  node: TemplateNode,
  fields: Record<string, string>,
  options: RenderOptions,
): string {
  switch (node.type) {
    case "doc":
      return renderDocNode(node, fields, options);

    case "paragraph":
      return renderParagraphNode(node, fields, options);

    case "horizontalRule":
      return "<hr>";

    case "hardBreak":
      return "<br>";

    case "text":
      return renderTextNode(node);

    case CUSTOM_NODE_TYPES.fieldReference:
      return escapeHtml(fields[node.attrs?.fieldName as string] ?? "");

    case CUSTOM_NODE_TYPES.frontSideReference:
      return options.frontSide ?? "";

    case CUSTOM_NODE_TYPES.clozeField:
      return processCloze(
        fields[node.attrs?.fieldName as string] ?? "",
        options.cardOrdinal ?? 1,
        options.showAnswer ?? false,
      );

    case "image":
      return `<img src="${escapeHtml(node.attrs?.src as string)}">`;

    default:
      return renderChildren(node, fields, options);
  }
}

/**
 * Render a WYSIWYG template with field values to produce final HTML.
 *
 * This is the replacement for renderTemplate() from template-renderer.ts
 * when using the new WYSIWYG format.
 */
export function renderWysiwygTemplate(
  doc: TemplateNode,
  fields: Record<string, string>,
  options?: RenderOptions,
): string {
  return renderNode(doc, fields, options ?? {});
}
