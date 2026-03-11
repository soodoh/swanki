/**
 * Unified template renderer that handles both legacy mustache templates
 * and new WYSIWYG JSON templates.
 *
 * Template strings that start with '{"version":1' are treated as WYSIWYG JSON.
 * All other strings are treated as legacy mustache HTML templates.
 */
import { renderTemplate as renderMustacheTemplate } from "../template-renderer";
import { renderWysiwygTemplate } from "./wysiwyg-to-html";
import type { WysiwygTemplate } from "./types";

type RenderOptions = {
  cardOrdinal?: number;
  frontSide?: string;
  showAnswer?: boolean;
};

/**
 * Check if a template string is in WYSIWYG JSON format.
 */
export function isWysiwygTemplate(template: string): boolean {
  return template.startsWith('{"version":1');
}

/**
 * Parse a WYSIWYG template string to its typed object.
 */
export function parseWysiwygTemplate(template: string): WysiwygTemplate {
  return JSON.parse(template) as WysiwygTemplate;
}

/**
 * Render a card template (either legacy or WYSIWYG) with field values.
 *
 * Automatically detects the format and uses the appropriate renderer.
 */
export function renderCardTemplate(
  template: string,
  fields: Record<string, string>,
  options?: RenderOptions,
): string {
  if (isWysiwygTemplate(template)) {
    const parsed = parseWysiwygTemplate(template);
    return renderWysiwygTemplate(parsed.doc, fields, options);
  }
  return renderMustacheTemplate(template, fields, options);
}
