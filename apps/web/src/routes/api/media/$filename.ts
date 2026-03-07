import { createFileRoute } from "@tanstack/react-router";
import { MediaService } from "../../../lib/services/media-service";
import { db } from "../../../db";
import { existsSync } from "node:fs";

const mediaService = new MediaService(db);

export const Route = createFileRoute("/api/media/$filename")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const result = mediaService.getByFilename(params.filename);

        if (!result) {
          return Response.json({ error: "File not found" }, { status: 404 });
        }

        if (!existsSync(result.filePath)) {
          return Response.json(
            { error: "File not found on disk" },
            { status: 404 },
          );
        }

        const file = Bun.file(result.filePath);
        return new Response(file, {
          headers: {
            "Content-Type": result.record.mimeType,
            "Content-Length": String(result.record.size),
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
          },
        });
      },
    },
  },
});
