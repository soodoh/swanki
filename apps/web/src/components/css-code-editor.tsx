import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "@/lib/theme";

type CssCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function isDark(theme: "light" | "dark" | "system"): boolean {
  if (theme === "system") {
    return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme === "dark";
}

export function CssCodeEditor({
  value,
  onChange,
  className,
}: CssCodeEditorProps): React.ReactElement {
  const { theme } = useTheme();
  const dark = isDark(theme);
  const extensions = useMemo(
    () =>
      dark
        ? [css(), oneDark, EditorView.lineWrapping]
        : [css(), EditorView.lineWrapping],
    [dark],
  );

  return (
    <div className={className}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={dark ? "dark" : "light"}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
        }}
        className="rounded-lg border border-input font-mono text-sm [&_.cm-gutters]:border-none [&_.cm-content]:caret-foreground [&_.cm-activeLine]:bg-muted/30 [&_.cm-selectionBackground]:!bg-primary/20 [&_.cm-editor]:outline-none [&_.cm-focused]:outline-none"
        minHeight="96px"
      />
    </div>
  );
}
