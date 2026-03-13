import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { renderTemplate } from "@/lib/template-renderer";
import { sanitizeHtml } from "@/lib/sanitize";
import { expandMediaTags } from "@/lib/media-tags";

type NoteTypeInfo = {
  name: string;
  fields: Array<{ name: string; ordinal: number }>;
  templates: Array<{
    name: string;
    /** Mustache HTML template. */
    questionFormat: string;
    answerFormat: string;
    ordinal: number;
  }>;
  css: string;
};

type ApkgCardPreviewProps = {
  noteTypeName: string;
  fields: Record<string, string>;
  noteType: NoteTypeInfo;
  index: number;
};

export function ApkgCardPreview({
  noteTypeName,
  fields,
  noteType,
  index,
}: ApkgCardPreviewProps): React.ReactElement {
  const [showBack, setShowBack] = useState(false);

  const template = noteType.templates[0];
  if (!template) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          No template available for this note type.
        </p>
      </div>
    );
  }

  // Render using the unified renderer (handles both WYSIWYG JSON and legacy mustache)
  const frontHtml = expandMediaTags(
    sanitizeHtml(renderTemplate(template.questionFormat, fields)),
  );
  const backHtml = expandMediaTags(
    sanitizeHtml(
      renderTemplate(template.answerFormat, fields, {
        frontSide: frontHtml,
        showAnswer: true,
      }),
    ),
  );

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            #{index + 1}
          </span>
          <Badge variant="secondary" className="text-xs">
            {noteTypeName}
          </Badge>
          {template.name && (
            <span className="text-xs text-muted-foreground">
              {template.name}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowBack((prev) => !prev)}
        >
          {showBack ? (
            <>
              Hide Back
              <ChevronUp className="ml-1 size-3" />
            </>
          ) : (
            <>
              Show Back
              <ChevronDown className="ml-1 size-3" />
            </>
          )}
        </Button>
      </div>

      {/* oxlint-disable react/no-danger -- all HTML sanitized via DOMPurify */}
      <div>
        <div className="p-4">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Front
          </p>
          <div
            className="card prose prose-sm dark:prose-invert max-w-none"
            style={{ backgroundColor: "transparent", color: "inherit" }}
            dangerouslySetInnerHTML={{ __html: frontHtml }}
          />
        </div>

        {showBack && (
          <div className="border-t bg-muted/10 p-4">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Back
            </p>
            <div
              className="card prose prose-sm dark:prose-invert max-w-none"
              style={{ backgroundColor: "transparent", color: "inherit" }}
              dangerouslySetInnerHTML={{ __html: backHtml }}
            />
          </div>
        )}
      </div>
      {/* oxlint-enable react/no-danger */}
    </div>
  );
}
