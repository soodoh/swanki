/**
 * Tiptap extension for field reference tokens in card templates.
 *
 * Renders as an inline pill/chip showing the field name.
 * At study time, the field reference is substituted with the actual value.
 */
import { Node, mergeAttributes } from "@tiptap/react";

export const FieldReference = Node.create({
  name: "fieldReference",
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
    return [{ tag: 'span[data-type="field-reference"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "field-reference",
        class: "field-reference",
      }),
      `{{${HTMLAttributes["data-field-name"] as string}}}`,
    ];
  },
});
