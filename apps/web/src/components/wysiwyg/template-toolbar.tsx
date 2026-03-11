/**
 * Toolbar for the WYSIWYG template editor.
 *
 * Provides formatting controls and field insertion menus.
 */
import { useState } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  Plus,
  Type,
  Braces,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

type ToolbarProps = {
  editor: Editor;
  fieldNames: string[];
  isAnswerTemplate?: boolean;
  onInsertField: (fieldName: string) => void;
  onInsertClozeField: (fieldName: string) => void;
  onInsertFrontSide: () => void;
};

export function TemplateToolbar({
  editor,
  fieldNames,
  isAnswerTemplate,
  onInsertField,
  onInsertClozeField,
  onInsertFrontSide,
}: ToolbarProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <Bold className="size-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <Italic className="size-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline"
      >
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Align left"
      >
        <AlignLeft className="size-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Align center"
      >
        <AlignCenter className="size-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Align right"
      >
        <AlignRight className="size-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Horizontal rule */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <Minus className="size-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Field insertion */}
      <FieldInsertMenu
        fieldNames={fieldNames}
        isAnswerTemplate={isAnswerTemplate}
        onInsertField={onInsertField}
        onInsertClozeField={onInsertClozeField}
        onInsertFrontSide={onInsertFrontSide}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-7 w-7 p-0 ${active ? "bg-accent text-accent-foreground" : ""}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

function FieldInsertMenu({
  fieldNames,
  isAnswerTemplate,
  onInsertField,
  onInsertClozeField,
  onInsertFrontSide,
}: {
  fieldNames: string[];
  isAnswerTemplate?: boolean;
  onInsertField: (fieldName: string) => void;
  onInsertClozeField: (fieldName: string) => void;
  onInsertFrontSide: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
          >
            <Plus className="size-3" />
            Insert Field
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Field Reference</DropdownMenuLabel>
          {fieldNames.map((name) => (
            <DropdownMenuItem
              key={`field-${name}`}
              onClick={() => {
                onInsertField(name);
                setOpen(false);
              }}
            >
              <Type className="mr-2 size-3.5" />
              <span className="font-mono text-xs">{`{{${name}}}`}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Cloze Deletion</DropdownMenuLabel>
          {fieldNames.map((name) => (
            <DropdownMenuItem
              key={`cloze-${name}`}
              onClick={() => {
                onInsertClozeField(name);
                setOpen(false);
              }}
            >
              <Braces className="mr-2 size-3.5" />
              <span className="font-mono text-xs">{`{{cloze:${name}}}`}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        {isAnswerTemplate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onInsertFrontSide();
                setOpen(false);
              }}
            >
              <Type className="mr-2 size-3.5" />
              <span className="font-mono text-xs">{`{{FrontSide}}`}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
