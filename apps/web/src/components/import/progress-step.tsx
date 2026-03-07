import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type ImportProgress = {
  status: "idle" | "uploading" | "processing" | "complete" | "error";
  progress: number;
  result?: {
    cardCount: number;
    noteCount: number;
    deckCount?: number;
    duplicatesSkipped: number;
    errors: string[];
  };
  errorMessage?: string;
};

type ProgressStepProps = {
  importProgress: ImportProgress;
  onRetry: () => void;
};

export function ProgressStep({
  importProgress,
  onRetry,
}: ProgressStepProps): React.ReactElement {
  const { status, progress, result, errorMessage } = importProgress;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {status === "complete"
            ? "Import Complete"
            : status === "error"
              ? "Import Failed"
              : "Importing..."}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {status === "complete"
            ? "Your cards have been imported successfully."
            : status === "error"
              ? "Something went wrong during the import."
              : "Please wait while your file is being processed."}
        </p>
      </div>

      {/* Progress bar */}
      {(status === "uploading" || status === "processing") && (
        <div className="space-y-2">
          <Progress value={progress}>
            <span className="text-xs text-muted-foreground">
              {status === "uploading" ? "Uploading..." : "Processing..."}
            </span>
          </Progress>
          <p className="text-center text-xs text-muted-foreground">
            {Math.round(progress)}%
          </p>
        </div>
      )}

      {/* Success state */}
      {status === "complete" && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-green-500/5 p-6">
            <CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
            <div className="text-center">
              <p className="text-lg font-semibold">Import Successful</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-lg font-semibold">{result.cardCount}</p>
              <p className="text-xs text-muted-foreground">Cards imported</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-lg font-semibold">{result.noteCount}</p>
              <p className="text-xs text-muted-foreground">Notes created</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-lg font-semibold">
                {result.duplicatesSkipped}
              </p>
              <p className="text-xs text-muted-foreground">
                Duplicates skipped
              </p>
            </div>
          </div>

          {/* Errors list */}
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {result.errors.length} warning
                  {result.errors.length !== 1 ? "s" : ""}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {err}
                  </li>
                ))}
                {result.errors.length > 5 && (
                  <li className="text-xs text-muted-foreground">
                    ...and {result.errors.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Link to="/" className="flex-1">
              <Button className="w-full">Go to Dashboard</Button>
            </Link>
            <Link to="/import" className="flex-1">
              <Button variant="outline" className="w-full">
                Import Another
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
            <XCircle className="size-10 text-destructive" />
            <div className="text-center">
              <p className="text-lg font-semibold">Import Failed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {errorMessage ?? "An unexpected error occurred."}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onRetry}>
              Try Again
            </Button>
            <Link to="/" className="flex-1">
              <Button variant="ghost" className="w-full">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
