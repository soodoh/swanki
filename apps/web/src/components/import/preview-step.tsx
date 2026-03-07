import { AlertTriangle, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PreviewStepProps = {
  file: File | undefined;
  format: string | undefined;
  sampleCards: { fields: Record<string, string> }[];
  totalCards: number;
  duplicateCount: number;
};

export function PreviewStep({
  file,
  format,
  sampleCards,
  totalCards,
  duplicateCount,
}: PreviewStepProps): React.ReactElement {
  const fieldNames =
    sampleCards.length > 0 ? Object.keys(sampleCards[0].fields) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Preview Import</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the cards that will be imported.
        </p>
      </div>

      {/* Summary stats */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          <FileText className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{totalCards}</p>
            <p className="text-xs text-muted-foreground">Total cards</p>
          </div>
        </div>

        {duplicateCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="size-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {duplicateCount}
              </p>
              <p className="text-xs text-muted-foreground">Duplicates</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
          <Badge variant="secondary">{format?.toUpperCase()}</Badge>
          <div>
            <p className="text-sm font-medium truncate max-w-[150px]">
              {file?.name ?? "Unknown"}
            </p>
            <p className="text-xs text-muted-foreground">Source file</p>
          </div>
        </div>
      </div>

      {/* Sample cards table */}
      {sampleCards.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Sample ({Math.min(sampleCards.length, 5)} of {totalCards} cards)
          </h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {fieldNames.map((name) => (
                    <TableHead key={name}>{name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleCards.slice(0, 5).map((card, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    {fieldNames.map((name) => {
                      const value = card.fields[name] ?? "";
                      const stripped = value.replace(/<[^>]*>/g, "");
                      const display =
                        stripped.length > 80
                          ? `${stripped.slice(0, 80)}...`
                          : stripped;
                      return (
                        <TableCell
                          key={name}
                          className="max-w-[200px] truncate"
                        >
                          {display || (
                            <span className="text-muted-foreground italic">
                              empty
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
          <p className="text-sm text-muted-foreground">
            No preview data available
          </p>
        </div>
      )}

      {duplicateCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""}{" "}
                detected
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Duplicate cards will be skipped during import.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
