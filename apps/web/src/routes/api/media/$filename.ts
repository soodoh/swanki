import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { MediaService } from "../../../lib/services/media-service";
import { db } from "../../../db";
import { existsSync, readFileSync } from "node:fs";

const mediaService = new MediaService(db);

export const Route = createFileRoute("/api/media/$filename")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireSession(request);

        const result = mediaService.getByFilename(params.filename);

        if (!result) {
          return Response.json({ error: "File not found" }, { status: 404 });
        }

        // oxlint-disable-next-line typescript/no-unsafe-call -- existsSync is a typed Node.js API
        if (!existsSync(result.filePath)) {
          return Response.json(
            { error: "File not found on disk" },
            { status: 404 },
          );
        }

        // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
        const fileBuffer = readFileSync(result.filePath);
        return new Response(fileBuffer, {
          headers: {
            "Content-Type": result.record.mimeType,
            "Content-Length": String(result.record.size),
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
          },
        });
      },
    },
  },
});
