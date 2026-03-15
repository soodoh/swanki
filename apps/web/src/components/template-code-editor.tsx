import { useRef, useState, useCallback, useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { Plus, Type, Braces, Hash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

/** Minimal type for the CodeMirror EditorView methods we use. */
type CodeEditorView = {
  state: { selection: { main: { from: number; to: number } } };
  dispatch(spec: {
    changes: { from: number; to: number; insert: string };
    selection: { anchor: number };
  }): void;
  focus(): void;
};

type TemplateCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fieldNames: string[];
  isAnswerTemplate?: boolean;
  className?: string;
};

function isDark(theme: "light" | "dark" | "system"): boolean {
  if (theme === "system") {
    return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme === "dark";
}

export function TemplateCodeEditor({
  value,
  onChange,
  fieldNames,
  isAnswerTemplate,
  className,
}: TemplateCodeEditorProps): React.ReactElement {
  const { theme } = useTheme();
  const dark = isDark(theme);
  const extensions = useMemo(
    () =>
      dark
        ? [html(), oneDark, EditorView.lineWrapping]
        : [html(), EditorView.lineWrapping],
    [dark],
  );
  const viewRef = useRef<CodeEditorView | undefined>(undefined);

  const insertText = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
  }, []);

  return (
    <div className={className}>
      <Toolbar
        fieldNames={fieldNames}
        isAnswerTemplate={isAnswerTemplate}
        onInsertField={(name) => insertText(`{{${name}}}`)}
        onInsertCloze={(name) => insertText(`{{cloze:${name}}}`)}
        onInsertConditional={(name) =>
          insertText(`{{#${name}}}\n\n{{/${name}}}`)
        }
        onInsertFrontSide={() => insertText("{{FrontSide}}")}
      />
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={dark ? "dark" : "light"}
        extensions={extensions}
        onCreateEditor={(view: CodeEditorView) => {
          viewRef.current = view;
        }}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
        }}
        className="rounded-b-lg border border-t-0 border-input font-mono text-sm [&_.cm-gutters]:border-none [&_.cm-content]:caret-foreground [&_.cm-activeLine]:bg-muted/30 [&_.cm-selectionBackground]:!bg-primary/20 [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none"
        minHeight="96px"
      />
    </div>
  );
}

function Toolbar({
  fieldNames,
  isAnswerTemplate,
  onInsertField,
  onInsertCloze,
  onInsertConditional,
  onInsertFrontSide,
}: {
  fieldNames: string[];
  isAnswerTemplate?: boolean;
  onInsertField: (name: string) => void;
  onInsertCloze: (name: string) => void;
  onInsertConditional: (name: string) => void;
  onInsertFrontSide: () => void;
}): React.ReactElement {
  const [fieldOpen, setFieldOpen] = useState(false);
  const [clozeOpen, setClozeOpen] = useState(false);
  const [condOpen, setCondOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-input bg-muted/30 p-1">
      {/* Insert Field */}
      <DropdownMenu open={fieldOpen} onOpenChange={setFieldOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Type className="size-3" />
              Field
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Insert Field</DropdownMenuLabel>
            {fieldNames.map((name) => (
              <DropdownMenuItem
                key={name}
                onClick={() => {
                  onInsertField(name);
                  setFieldOpen(false);
                }}
              >
                <span className="font-mono text-xs">{`{{${name}}}`}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Insert Cloze */}
      <DropdownMenu open={clozeOpen} onOpenChange={setClozeOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Braces className="size-3" />
              Cloze
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Insert Cloze</DropdownMenuLabel>
            {fieldNames.map((name) => (
              <DropdownMenuItem
                key={name}
                onClick={() => {
                  onInsertCloze(name);
                  setClozeOpen(false);
                }}
              >
                <span className="font-mono text-xs">{`{{cloze:${name}}}`}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Insert Conditional */}
      <DropdownMenu open={condOpen} onOpenChange={setCondOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
            >
              <Hash className="size-3" />
              Conditional
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Insert Conditional</DropdownMenuLabel>
            {fieldNames.map((name) => (
              <DropdownMenuItem
                key={name}
                onClick={() => {
                  onInsertConditional(name);
                  setCondOpen(false);
                }}
              >
                <span className="font-mono text-xs">{`{{#${name}}}...{{/${name}}}`}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 h-5 w-px bg-border" />

      {/* Insert FrontSide */}
      {isAnswerTemplate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onInsertFrontSide}
        >
          <Plus className="size-3" />
          FrontSide
        </Button>
      )}
    </div>
  );
}
