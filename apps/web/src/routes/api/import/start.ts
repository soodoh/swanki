import { createFileRoute } from "@tanstack/react-router";
import { readFileSync } from "node:fs";
import { requireSession } from "../../../lib/auth-middleware";
import {
  getUploadPath,
  deleteUpload,
} from "../../../lib/services/upload-service";
import {
  detectFormat,
  ImportService,
} from "../../../lib/services/import-service";
import { MediaService } from "../../../lib/services/media-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import { createJob, updateJob } from "../../../lib/import/import-job";
import { db } from "../../../db";

async function processImport(
  jobId: string,
  userId: string,
  fileId: string,
  filePath: string,
  merge: boolean,
): Promise<void> {
  try {
    updateJob(jobId, {
      phase: "parsing",
      progress: 0,
      detail: "Reading and parsing file...",
    });

    // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- node:fs is untyped in this project
    const fileData: Buffer = readFileSync(filePath);
    const buffer: ArrayBuffer = fileData.buffer.slice(
      fileData.byteOffset,
      fileData.byteOffset + fileData.byteLength,
    );
    const apkgData = parseApkg(buffer);

    updateJob(jobId, {
      phase: "media",
      progress: 0,
      detail: `Importing ${apkgData.media.length} media files...`,
    });

    const mediaService = new MediaService(db);
    const {
      mapping: mediaMapping,
      warnings: mediaWarnings,
      mediaCount,
    } = await mediaService.importBatch(userId, apkgData.media);

    updateJob(jobId, {
      phase: "notes",
      progress: 0,
      detail: "Importing notes and cards...",
    });

    const importService = new ImportService(db);
    const result = await importService.importFromApkgBatched(
      userId,
      apkgData,
      mediaMapping,
      merge,
      (phase, progress, detail) => {
        updateJob(jobId, {
          phase: phase as "notes" | "cards",
          progress,
          detail,
        });
      },
    );

    updateJob(jobId, {
      status: "complete",
      phase: "cleanup",
      progress: 100,
      detail: "Import complete!",
      result: {
        ...result,
        mediaWarnings,
        // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment) -- mediaCount is number from importBatch
        mediaCount,
      },
    });

    // Clean up uploaded file
    deleteUpload(userId, fileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    updateJob(jobId, {
      status: "error",
      phase: "cleanup",
      progress: 0,
      detail: message,
      error: message,
    });
  }
}

export const Route = createFileRoute("/api/import/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const userId = session.user.id;

        try {
          const body = (await request.json()) as {
            fileId?: string;
            mergeMode?: string;
          };

          if (!body.fileId) {
            return Response.json(
              { error: "fileId is required" },
              { status: 400 },
            );
          }

          const filePath = getUploadPath(userId, body.fileId);
          if (!filePath) {
            return Response.json(
              { error: "Upload not found or expired" },
              { status: 404 },
            );
          }

          // Detect format from file extension
          const ext = filePath.slice(filePath.lastIndexOf("."));
          const format = detectFormat(`file${ext}`);
          if (format !== "apkg" && format !== "colpkg") {
            return Response.json(
              {
                error:
                  "Async import only supports .apkg/.colpkg files. Use /api/import/ for other formats.",
              },
              { status: 400 },
            );
          }

          const jobId = createJob();
          const merge = body.mergeMode === "merge";

          // Kick off processing asynchronously
          setTimeout(() => {
            void processImport(jobId, userId, body.fileId!, filePath, merge);
          }, 0);

          return Response.json({ jobId }, { status: 202 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to start import";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
