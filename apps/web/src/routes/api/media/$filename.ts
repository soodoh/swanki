import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { MediaService } from "../../../lib/services/media-service";
import { nodeFs } from "@swanki/core/node-filesystem";
import { db } from "../../../db";
import { existsSync, readFileSync } from "node:fs";

const mediaDir: string = join(process.cwd(), "data", "media");
const mediaService = new MediaService(db, mediaDir, nodeFs);

export const Route = createFileRoute("/api/media/$filename")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireSession(request);

        const result = await mediaService.getByFilename(params.filename);

        if (!result) {
          return Response.json({ error: "File not found" }, { status: 404 });
        }

        if (!existsSync(result.filePath)) {
          return Response.json(
            { error: "File not found on disk" },
            { status: 404 },
          );
        }

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
