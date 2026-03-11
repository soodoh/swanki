/**
 * WYSIWYG template editor for card templates.
 *
 * Provides a rich text editor where users can:
 * - Format text (bold, italic, underline, colors, alignment)
 * - Insert field references as visual tokens via a dropdown
 * - Insert cloze field references
 * - Insert FrontSide references (in answer templates)
 * - Insert images
 * - Add horizontal rules
 */
import { useCallback, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Image as ImageExtension } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";

import { FieldReference } from "@/lib/wysiwyg/extensions/field-reference";
import { FrontSideReference } from "@/lib/wysiwyg/extensions/front-side-reference";
import { ClozeField } from "@/lib/wysiwyg/extensions/cloze-field";
import type { WysiwygTemplate, TemplateNode } from "@/lib/wysiwyg/types";
import { TemplateToolbar } from "./template-toolbar";

type TemplateEditorProps = {
  /** The current template content as a JSON string. */
  content: string;
  /** Available field names for insertion. */
  fieldNames: string[];
  /** Whether this is an answer template (shows FrontSide option). */
  isAnswerTemplate?: boolean;
  /** Called when the content changes. */
  onChange: (content: string) => void;
};

function parseContent(content: string): TemplateNode | undefined {
  try {
    const parsed = JSON.parse(content) as WysiwygTemplate;
    if (parsed.version === 1 && parsed.doc) {
      return parsed.doc;
    }
  } catch {
    // Not JSON — return undefined to use default
  }
  return undefined;
}

function buildDefaultDoc(): TemplateNode {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function TemplateEditor({
  content,
  fieldNames,
  isAnswerTemplate,
  onChange,
}: TemplateEditorProps): React.ReactElement {
  const initialContent = useMemo(
    () => parseContent(content) ?? buildDefaultDoc(),
    // Only use initial content on mount
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleUpdate = useCallback(
    ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
      if (!editor) {
        return;
      }
      const doc = editor.getJSON() as TemplateNode;
      const template: WysiwygTemplate = { version: 1, doc };
      onChange(JSON.stringify(template));
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable code block and blockquote — not useful in card templates
        codeBlock: false,
        blockquote: false,
      }),
      Underline,
      TextAlign.configure({
        types: ["paragraph", "heading"],
      }),
      TextStyle,
      Color,
      ImageExtension.configure({
        inline: true,
      }),
      Placeholder.configure({
        placeholder: "Design your card template...",
      }),
      FieldReference,
      FrontSideReference,
      ClozeField,
    ],
    content: initialContent,
    onUpdate: handleUpdate,
  });

  const insertFieldReference = useCallback(
    (fieldName: string) => {
      if (!editor) {
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: "fieldReference",
          attrs: { fieldName },
        })
        .run();
    },
    [editor],
  );

  const insertClozeField = useCallback(
    (fieldName: string) => {
      if (!editor) {
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: "clozeField",
          attrs: { fieldName },
        })
        .run();
    },
    [editor],
  );

  const insertFrontSide = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().insertContent({ type: "frontSideReference" }).run();
  }, [editor]);

  if (!editor) {
    return <div className="h-32 animate-pulse rounded-lg border bg-muted/20" />;
  }

  return (
    <div className="rounded-lg border">
      <TemplateToolbar
        editor={editor}
        fieldNames={fieldNames}
        isAnswerTemplate={isAnswerTemplate}
        onInsertField={insertFieldReference}
        onInsertClozeField={insertClozeField}
        onInsertFrontSide={insertFrontSide}
      />
      <EditorContent
        editor={editor}
        className="wysiwyg-editor prose prose-sm dark:prose-invert max-w-none p-3 min-h-[120px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]"
      />
    </div>
  );
}
