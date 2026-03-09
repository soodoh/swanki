import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import {
  ImportService,
  detectFormat,
} from "../../../lib/services/import-service";
import { MediaService } from "../../../lib/services/media-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import { parseCsv } from "../../../lib/import/csv-parser";
import { db } from "../../../db";

const importService = new ImportService(db);

export const Route = createFileRoute("/api/import/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const userId = session.user.id;

        try {
          const contentType = request.headers.get("content-type") ?? "";
          if (!contentType.includes("multipart/form-data")) {
            return Response.json(
              { error: "Expected multipart/form-data" },
              { status: 400 },
            );
          }

          const formData = await request.formData();
          const file = formData.get("file");

          if (!(file instanceof File)) {
            return Response.json(
              { error: "No file provided" },
              { status: 400 },
            );
          }

          const format = detectFormat(file.name);
          if (!format) {
            return Response.json(
              { error: `Unsupported file format: ${file.name}` },
              { status: 400 },
            );
          }

          if (format === "apkg" || format === "colpkg") {
            const buffer = await file.arrayBuffer();
            const apkgData = parseApkg(buffer);
            const mediaService = new MediaService(db);
            const {
              mapping: mediaMapping,
              warnings: mediaWarnings,
              mediaCount,
            } = await mediaService.importBatch(userId, apkgData.media);
            const result = importService.importFromApkg(
              userId,
              apkgData,
              mediaMapping,
            );
            return Response.json(
              // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment) -- mediaCount is number from importBatch
              { ...result, mediaWarnings, mediaCount },
              { status: 201 },
            );
          }

          if (format === "csv" || format === "txt") {
            const text = await file.text();
            const delimiter = format === "txt" ? "\t" : ",";
            const parsed = parseCsv(text, {
              delimiter,
              hasHeader: true,
            });
            const deckName = file.name.replace(/\.(csv|txt)$/i, "") || "Import";
            const result = importService.importFromCsv(userId, {
              headers: parsed.headers,
              rows: parsed.rows,
              deckName,
            });
            return Response.json(result, { status: 201 });
          }

          // format === "crowdanki"
          const text = await file.text();
          const json: unknown = JSON.parse(text);
          const result = importService.importFromCrowdAnki(userId, json);
          return Response.json(result, { status: 201 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Import failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
