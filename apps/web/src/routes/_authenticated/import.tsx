import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UploadStep } from "@/components/import/upload-step";
import { ConfigureStep } from "@/components/import/configure-step";
import type { ImportConfig } from "@/components/import/configure-step";
import { PreviewStep } from "@/components/import/preview-step";
import { ProgressStep } from "@/components/import/progress-step";
import type { ImportProgress } from "@/components/import/progress-step";
import type { ApkgPreviewData } from "@/lib/import/apkg-parser-client";
import { buildClientPreview } from "@/lib/import/apkg-parser-client";
import { buildCrowdAnkiPreview } from "@/lib/import/crowdanki-parser";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

const STEPS = [
  { label: "Upload", description: "Select a file" },
  { label: "Configure", description: "Adjust settings" },
  { label: "Preview", description: "Review cards" },
  { label: "Import", description: "Process file" },
] as const;

function parseCsvLocal(
  text: string,
  delimiter: string,
): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const rows = lines.map((line) => line.split(delimiter));
  const headers = rows[0] ?? [];
  return { headers, rows: rows.slice(1) };
}

type WizardState = {
  currentStep: number;
  file: File | undefined;
  detectedFormat: string | undefined;
  config: ImportConfig;
  csvData: { headers: string[]; rows: string[][] } | undefined;
  importProgress: ImportProgress;
  apkgPreview: ApkgPreviewData | undefined;
  previewLoading: boolean;
  previewError: string | undefined;
};

function stepperClass(index: number, currentStep: number): string {
  if (index < currentStep) {
    return "border-primary bg-primary text-primary-foreground";
  }
  if (index === currentStep) {
    return "border-primary bg-background text-primary";
  }
  return "border-muted text-muted-foreground";
}

function Stepper({ currentStep }: { currentStep: number }): React.ReactElement {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors ${stepperClass(index, currentStep)}`}
              >
                {index < currentStep ? (
                  <svg
                    className="size-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="mt-1.5 text-center">
                <p
                  className={`text-xs font-medium ${
                    index <= currentStep
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`mx-2 mt-[-1.5rem] h-0.5 w-16 sm:w-24 ${
                  index < currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

let cachedState: WizardState | undefined;

// oxlint-disable-next-line eslint(complexity) -- wizard component with multiple steps inherently has high branching
function ImportPage(): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(cachedState?.currentStep ?? 0);
  const [file, setFile] = useState<File | undefined>(cachedState?.file);
  const [detectedFormat, setDetectedFormat] = useState<string | undefined>(
    cachedState?.detectedFormat,
  );
  const [config, setConfig] = useState<ImportConfig>(cachedState?.config ?? {});
  const [csvData, setCsvData] = useState<
    | {
        headers: string[];
        rows: string[][];
      }
    | undefined
  >(cachedState?.csvData);
  const [apkgPreview, setApkgPreview] = useState<ApkgPreviewData | undefined>(
    cachedState?.apkgPreview,
  );
  const [previewLoading, setPreviewLoading] = useState(
    cachedState?.previewLoading ?? false,
  );
  const [previewError, setPreviewError] = useState<string | undefined>(
    cachedState?.previewError,
  );
  const [importProgress, setImportProgress] = useState<ImportProgress>(() => {
    if (!cachedState) {
      return { status: "idle", progress: 0 };
    }
    const cached = cachedState.importProgress;
    if (cached.status === "uploading" || cached.status === "processing") {
      return {
        status: "error",
        progress: 0,
        errorMessage:
          "Import was interrupted. It may have completed — check your decks before retrying.",
      };
    }
    return cached;
  });

  useEffect(() => {
    cachedState = {
      currentStep,
      file,
      detectedFormat,
      config,
      csvData,
      importProgress,
      apkgPreview,
      previewLoading,
      previewError,
    };
  }, [
    currentStep,
    file,
    detectedFormat,
    config,
    csvData,
    importProgress,
    apkgPreview,
    previewLoading,
    previewError,
  ]);

  // Parse CSV when file is selected and format is csv/txt
  useEffect(() => {
    if (!file || (detectedFormat !== "csv" && detectedFormat !== "txt")) {
      setCsvData(undefined);
      return;
    }

    void (async () => {
      const text = await file.text();
      const delimiter = detectedFormat === "txt" ? "\t" : ",";
      const parsed = parseCsvLocal(text, delimiter);
      setCsvData(parsed);

      // Set default config for CSV
      const defaultMapping: Record<number, string> = {};
      if (parsed.headers.length > 0) {
        defaultMapping[0] = "Front";
      }
      if (parsed.headers.length >= 2) {
        defaultMapping[1] = "Back";
      }

      setConfig((prev) => ({
        ...prev,
        csv: {
          delimiter,
          hasHeader: true,
          fieldMapping: defaultMapping,
          targetDeck: file.name.replace(/\.(csv|txt)$/i, "") || "Import",
        },
      }));
    })();
  }, [file, detectedFormat]);

  // Build sample cards for preview
  const sampleCards = useMemo(() => {
    if (!csvData || !config.csv) {
      return [];
    }

    const { rows } = csvData;
    const { fieldMapping } = config.csv;

    return rows.slice(0, 5).map((row) => {
      const fields: Record<string, string> = {};
      for (const [colIndex, fieldName] of Object.entries(fieldMapping)) {
        const idx = Number(colIndex);
        fields[fieldName] = row[idx] ?? "";
      }
      return { fields };
    });
  }, [csvData, config.csv]);

  const totalCards = csvData?.rows.length ?? 0;

  const canProceed = useMemo(() => {
    if (currentStep === 0) {
      return Boolean(file && detectedFormat);
    }
    if (currentStep === 3) {
      return importProgress.status === "complete";
    }
    return true;
  }, [currentStep, file, detectedFormat, importProgress.status]);

  const isApkgFormat = detectedFormat === "apkg" || detectedFormat === "colpkg";
  const isCrowdAnkiFormat = detectedFormat === "zip";

  const handleNext = useCallback(() => {
    if (currentStep >= STEPS.length - 1) {
      return;
    }
    if (currentStep === 2) {
      void runImport();
    } else if (currentStep === 1 && file && isApkgFormat) {
      setCurrentStep(2);
      void fetchApkgPreview(file);
    } else if (currentStep === 1 && file && isCrowdAnkiFormat) {
      setCurrentStep(2);
      void fetchCrowdAnkiPreview(file);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runImport/fetchApkgPreview/fetchCrowdAnkiPreview are stable functions using file state
  }, [currentStep, file, isApkgFormat, isCrowdAnkiFormat]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleRetry = useCallback(() => {
    cachedState = undefined;
    setImportProgress({ status: "idle", progress: 0 });
    setCurrentStep(0);
    setFile(undefined);
    setDetectedFormat(undefined);
    setConfig({});
    setCsvData(undefined);
    setApkgPreview(undefined);
    setPreviewLoading(false);
    setPreviewError(undefined);
  }, []);

  async function fetchApkgPreview(previewFile: File): Promise<void> {
    setPreviewLoading(true);
    setPreviewError(undefined);
    setApkgPreview(undefined);

    try {
      const buffer = await previewFile.arrayBuffer();
      const data = await buildClientPreview(buffer);
      setApkgPreview(data);

      // Fetch merge stats from server (needs DB access to compare with existing notes)
      const mergeMode = config.apkg?.mergeMode ?? "merge";
      if (mergeMode === "merge") {
        const formData = new FormData();
        formData.append("file", previewFile);
        formData.append("mergeMode", mergeMode);
        const res = await fetch("/api/import/preview", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const serverData = (await res.json()) as {
            mergeStats?: typeof data.mergeStats;
          };
          if (serverData.mergeStats) {
            setApkgPreview((prev) =>
              prev ? { ...prev, mergeStats: serverData.mergeStats } : prev,
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function fetchCrowdAnkiPreview(previewFile: File): Promise<void> {
    setPreviewLoading(true);
    setPreviewError(undefined);
    setApkgPreview(undefined);

    try {
      const buffer = await previewFile.arrayBuffer();
      const data = buildCrowdAnkiPreview(buffer);
      setApkgPreview(data);

      // Fetch merge stats from server (needs DB access to compare with existing notes)
      const formData = new FormData();
      formData.append("file", previewFile);
      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const serverData = (await res.json()) as {
          mergeStats?: typeof data.mergeStats;
        };
        if (serverData.mergeStats) {
          setApkgPreview((prev) =>
            prev ? { ...prev, mergeStats: serverData.mergeStats } : prev,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runImport(): Promise<void> {
    if (!file) {
      return;
    }

    setCurrentStep(3);
    setImportProgress({ status: "uploading", progress: 20 });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mergeMode", config.apkg?.mergeMode ?? "merge");

      setImportProgress({ status: "processing", progress: 50 });

      const res = await fetch("/api/import/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error ?? "Import failed");
      }

      const result = (await res.json()) as {
        cardCount: number;
        noteCount: number;
        deckCount?: number;
        deckId?: string;
        duplicatesSkipped?: number;
        notesUpdated?: number;
        mediaWarnings?: string[];
        mediaCount?: number;
      };

      setImportProgress({
        status: "complete",
        progress: 100,
        result: {
          cardCount: result.cardCount,
          noteCount: result.noteCount,
          deckCount: result.deckCount,
          duplicatesSkipped: result.duplicatesSkipped ?? 0,
          notesUpdated: result.notesUpdated,
          errors: result.mediaWarnings ?? [],
          mediaCount: result.mediaCount,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setImportProgress({
        status: "error",
        progress: 0,
        errorMessage: message,
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Stepper currentStep={currentStep} />

      {/* Step content */}
      <div className="min-h-[300px]">
        {currentStep === 0 && (
          <UploadStep
            file={file}
            onFileSelect={setFile}
            detectedFormat={detectedFormat}
            onFormatDetected={setDetectedFormat}
          />
        )}

        {currentStep === 1 && (
          <ConfigureStep
            format={detectedFormat}
            file={file}
            config={config}
            onConfigChange={setConfig}
            csvPreview={csvData?.rows.slice(0, 3)}
            csvHeaders={csvData?.headers}
          />
        )}

        {currentStep === 2 && (
          <PreviewStep
            file={file}
            format={detectedFormat}
            sampleCards={sampleCards}
            totalCards={totalCards}
            duplicateCount={0}
            apkgPreview={apkgPreview}
            previewLoading={previewLoading}
            previewError={previewError}
          />
        )}

        {currentStep === 3 && (
          <ProgressStep importProgress={importProgress} onRetry={handleRetry} />
        )}
      </div>

      {/* Navigation buttons */}
      {currentStep < 3 && (
        <div className="mt-8 flex items-center justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="size-4" data-icon="inline-start" />
            Back
          </Button>

          <Button size="sm" onClick={handleNext} disabled={!canProceed}>
            {currentStep === 2 ? (
              <>
                <Upload className="size-4" data-icon="inline-start" />
                Start Import
              </>
            ) : (
              <>
                Next
                <ChevronRight className="size-4" data-icon="inline-end" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
