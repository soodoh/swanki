// oxlint-disable eslint-plugin-react(no-danger) -- Card templates are user-authored content rendered via template-renderer
import { useRef, useMemo } from "react";

import { cn } from "@/lib/utils";
import { sanitizeHtml, sanitizeCss } from "@/lib/sanitize";
import { replaceSoundTags } from "@/lib/sound";
import { useCardAudio } from "@/lib/hooks/use-card-audio";

type CardDisplayProps = {
  html: string;
  css?: string;
  showAnswer: boolean;
  onShowAnswer: () => void;
  replayRef?: React.RefObject<(() => void) | undefined>;
  hideButton?: boolean;
};

/**
 * Displays card content as rendered HTML.
 *
 * dangerouslySetInnerHTML is used intentionally here because card
 * templates are authored by the user themselves (not third-party content)
 * and rendered via the template-renderer which only substitutes user-owned
 * field values into user-owned templates. This is the same model Anki uses.
 * All HTML is sanitized via DOMPurify (sanitizeHtml) before rendering.
 */
export function CardDisplay({
  html,
  css,
  showAnswer,
  onShowAnswer,
  replayRef,
  hideButton,
}: CardDisplayProps): React.ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  const processedHtml = sanitizeHtml(replaceSoundTags(html));
  const audioKey = useMemo(
    () => `${String(showAnswer)}-${html}`,
    [showAnswer, html],
  );
  const { replay } = useCardAudio(contentRef, audioKey);

  // Expose replay to parent via ref
  if (replayRef) {
    replayRef.current = replay;
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {css && <style dangerouslySetInnerHTML={{ __html: sanitizeCss(css) }} />}

      <div
        className={cn(
          "w-full max-w-2xl rounded-xl border bg-card p-8 shadow-sm",
          "min-h-[200px] flex items-center justify-center",
        )}
      >
        <div
          ref={contentRef}
          className="card-content prose prose-sm dark:prose-invert max-w-none text-center"
          dangerouslySetInnerHTML={{ __html: processedHtml }}
        />
      </div>

      {!showAnswer && !hideButton && (
        <button
          type="button"
          onClick={onShowAnswer}
          className={cn(
            "w-full max-w-2xl rounded-xl border bg-card px-6 py-4",
            "text-sm font-medium text-muted-foreground",
            "hover:bg-muted/50 hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          Show Answer
          <span className="ml-2 text-xs text-muted-foreground/60">(Space)</span>
        </button>
      )}
    </div>
  );
}
