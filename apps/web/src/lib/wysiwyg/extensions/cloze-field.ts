/**
 * Tiptap extension for cloze field references in card templates.
 *
 * Renders as an inline pill showing "cloze:FieldName".
 * At study time, processes cloze deletions in the field value.
 */
import { Node, mergeAttributes } from "@tiptap/react";

export const ClozeField = Node.create({
  name: "clozeField",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      fieldName: {
        default: "",
        parseHTML: (element) => element.dataset.fieldName,
        renderHTML: (attributes) => ({
          "data-field-name": attributes.fieldName as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="cloze-field"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "cloze-field",
        class: "cloze-field",
      }),
      `{{cloze:${HTMLAttributes["data-field-name"] as string}}}`,
    ];
  },
});
