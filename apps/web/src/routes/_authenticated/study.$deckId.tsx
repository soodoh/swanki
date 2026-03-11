import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Undo2, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardDisplay } from "@/components/study/card-display";
import { RatingButtons } from "@/components/study/rating-buttons";
import { StudyProgress } from "@/components/study/study-progress";
import {
  useStudySession,
  useSubmitReview,
  useUndoReview,
  useIntervalPreviews,
} from "@/lib/hooks/use-study";
import type { CardWithNote } from "@/lib/hooks/use-study";
import { renderTemplate } from "@/lib/template-renderer";

export const Route = createFileRoute("/_authenticated/study/$deckId")({
  component: StudyPage,
});

function StudyPage(): React.ReactElement {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- TanStack Router params are typed via route tree generation
  const { deckId } = Route.useParams();
  // oxlint-disable-next-line typescript/no-unsafe-argument -- TanStack Router params are typed via route tree generation
  const { data: session, isLoading, error, refetch } = useStudySession(deckId);
  const submitReview = useSubmitReview();
  const undoReview = useUndoReview();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [lastReviewedCardId, setLastReviewedCardId] = useState<
    string | undefined
  >(undefined);
  const cardStartTime = useRef<number>(Date.now());
  const replayRef = useRef<(() => void) | undefined>(undefined);
  const initialTotalRef = useRef<number>(0);

  const currentCard: CardWithNote | undefined = session?.cards[currentIndex];

  const { data: previews } = useIntervalPreviews(
    showAnswer ? currentCard?.id : undefined,
  );

  // Capture initial total on first session load
  useEffect(() => {
    if (session && initialTotalRef.current === 0) {
      initialTotalRef.current =
        session.counts.new + session.counts.learning + session.counts.review;
    }
  }, [session]);

  // Reset card timer when card changes
  useEffect(() => {
    cardStartTime.current = Date.now();
  }, [currentIndex]);

  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true);
  }, []);

  const handleRate = useCallback(
    async (rating: number) => {
      if (!currentCard) {
        return;
      }

      const timeTakenMs = Date.now() - cardStartTime.current;

      setLastReviewedCardId(currentCard.id);

      await submitReview.mutateAsync({
        cardId: currentCard.id,
        rating,
        timeTakenMs,
      });

      // Refetch FIRST, then batch state updates to avoid intermediate render
      await refetch();
      setReviewedCount((prev) => prev + 1);
      setShowAnswer(false);
      setCurrentIndex(0);
    },
    [currentCard, submitReview, refetch],
  );

  const handleUndo = useCallback(async () => {
    if (!lastReviewedCardId) {
      return;
    }

    await undoReview.mutateAsync({ cardId: lastReviewedCardId });

    // Refetch FIRST, then batch state updates to avoid intermediate render
    await refetch();
    setReviewedCount((prev) => Math.max(0, prev - 1));
    setShowAnswer(false);
    setLastReviewedCardId(undefined);
    setCurrentIndex(0);
  }, [lastReviewedCardId, undoReview, refetch]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Don't handle shortcuts if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (showAnswer) {
        if (e.key === "1") {
          e.preventDefault();
          void handleRate(1);
        } else if (e.key === "2") {
          e.preventDefault();
          void handleRate(2);
        } else if (e.key === "3") {
          e.preventDefault();
          void handleRate(3);
        } else if (e.key === "4") {
          e.preventDefault();
          void handleRate(4);
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleShowAnswer();
      }

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        replayRef.current?.();
      }

      if (
        (e.key === "z" || e.key === "Z") &&
        lastReviewedCardId &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        void handleUndo();
      }
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    showAnswer,
    handleShowAnswer,
    handleRate,
    handleUndo,
    lastReviewedCardId,
  ]);

  // Render functions
  function renderCardContent(): string {
    if (!currentCard || !session) {
      return "";
    }

    const template = session.templates[currentCard.templateId];
    if (!template) {
      // Fallback: render noteFields directly
      if (showAnswer) {
        return Object.entries(currentCard.noteFields)
          .map(([key, val]) => `<div><strong>${key}:</strong> ${val}</div>`)
          .join("");
      }
      const firstField = Object.values(currentCard.noteFields)[0] ?? "";
      return `<div>${firstField}</div>`;
    }

    const fields = currentCard.noteFields;
    const ordinal = currentCard.ordinal;

    if (showAnswer) {
      // Render front side first (needed for {{FrontSide}} in answer template)
      const frontHtml = renderTemplate(template.questionTemplate, fields, {
        cardOrdinal: ordinal + 1,
        showAnswer: false,
      });

      return renderTemplate(template.answerTemplate, fields, {
        cardOrdinal: ordinal + 1,
        frontSide: frontHtml,
        showAnswer: true,
      });
    }

    return renderTemplate(template.questionTemplate, fields, {
      cardOrdinal: ordinal + 1,
      showAnswer: false,
    });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Loading study session...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load study session.
        </div>
        <Link to="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const isComplete = session && session.cards.length === 0;

  return (
    <div className="flex flex-col bg-background -m-4 md:-m-6 h-[calc(100dvh-3.5rem)]">
      {/* Header */}
      <header className="shrink-0 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link to="/">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <h1 className="text-sm font-medium text-muted-foreground">Study</h1>
          <div className="flex-1" />
          {lastReviewedCardId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={undoReview.isPending}
            >
              <Undo2 className="size-3.5" data-icon="inline-start" />
              Undo
              <span className="text-xs text-muted-foreground/60 ml-1">(Z)</span>
            </Button>
          )}
        </div>
      </header>

      {isComplete ? (
        <div className="flex flex-1 min-h-0 items-center justify-center px-4">
          <CongratsScreen reviewedCount={reviewedCount} />
        </div>
      ) : (
        currentCard &&
        session && (
          <>
            {/* Scrollable card content area */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-8 pb-4">
              <div className="mx-auto flex max-w-4xl flex-col items-center gap-4">
                <StudyProgress
                  counts={session.counts}
                  initialTotal={initialTotalRef.current}
                />
                <CardDisplay
                  html={renderCardContent()}
                  showAnswer={showAnswer}
                  onShowAnswer={handleShowAnswer}
                  replayRef={replayRef}
                  hideButton
                />
              </div>
            </div>

            {/* Fixed bottom bar */}
            <div className="shrink-0 border-t bg-background px-4">
              <div className="mx-auto flex h-20 w-full max-w-2xl items-center justify-center">
                {showAnswer ? (
                  <RatingButtons
                    previews={previews}
                    disabled={submitReview.isPending}
                    onRate={handleRate}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleShowAnswer}
                    className="w-full rounded-xl border bg-card px-6 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Show Answer
                    <span className="ml-2 text-xs text-muted-foreground/60">
                      (Space)
                    </span>
                  </button>
                )}
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}

function CongratsScreen({
  reviewedCount,
}: {
  reviewedCount: number;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-green-500/10">
        <PartyPopper className="size-8 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-1">Congratulations!</h2>
        <p className="text-sm text-muted-foreground">
          You have finished studying for now.
          {reviewedCount > 0 && (
            <>
              {" "}
              You reviewed{" "}
              <span className="font-medium text-foreground">
                {reviewedCount}
              </span>{" "}
              {reviewedCount === 1 ? "card" : "cards"}.
            </>
          )}
        </p>
      </div>
      <Link to="/">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  );
}
