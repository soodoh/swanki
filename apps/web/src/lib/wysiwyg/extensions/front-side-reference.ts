/**
 * Tiptap extension for FrontSide reference in answer templates.
 *
 * Renders as an inline pill showing "FrontSide".
 * At study time, substituted with the rendered front side HTML.
 */
import { Node, mergeAttributes } from "@tiptap/react";

export const FrontSideReference = Node.create({
  name: "frontSideReference",
  group: "inline",
  inline: true,
  atom: true,

  parseHTML() {
    return [{ tag: 'span[data-type="front-side-reference"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "front-side-reference",
        class: "front-side-reference",
      }),
      "{{FrontSide}}",
    ];
  },
});
