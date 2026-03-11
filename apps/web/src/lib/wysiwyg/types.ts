/**
 * WYSIWYG template format types.
 *
 * Templates are stored as Tiptap-compatible JSON documents.
 * Field references and cloze deletions are represented as custom nodes/marks
 * so the WYSIWYG editor can render them as interactive tokens.
 */

/** Inline style properties supported in templates. */
export type InlineStyle = {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  textAlign?: string;
};

/** A Tiptap-compatible JSON node representing the template document. */
export type TemplateNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TemplateMark[];
  content?: TemplateNode[];
  text?: string;
};

/** A Tiptap-compatible mark (inline formatting). */
export type TemplateMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

/**
 * A WYSIWYG template document stored in the database.
 * This replaces the raw HTML string in cardTemplates.questionTemplate/answerTemplate.
 */
export type WysiwygTemplate = {
  /** Version for future migration support. */
  version: 1;
  /** The Tiptap JSON document. */
  doc: TemplateNode;
};

/**
 * Custom node types used in templates.
 *
 * - fieldReference: An inline node that renders as a pill/chip showing a field name.
 *   At render time, it substitutes the field's value.
 *   attrs: { fieldName: string }
 *
 * - frontSideReference: An inline node for {{FrontSide}} in answer templates.
 *   At render time, it substitutes the rendered front side HTML.
 *
 * - clozeField: An inline node referencing a cloze field.
 *   attrs: { fieldName: string }
 *   The field's value contains cloze markers like {{c1::text::hint}}.
 */
export const CUSTOM_NODE_TYPES = {
  fieldReference: "fieldReference",
  frontSideReference: "frontSideReference",
  clozeField: "clozeField",
} as const;
