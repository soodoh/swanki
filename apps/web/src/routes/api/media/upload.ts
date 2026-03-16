import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { MediaService } from "../../../lib/services/media-service";
import { nodeFs } from "@swanki/core/node-filesystem";
import { db } from "../../../db";

const mediaDir: string = join(process.cwd(), "data", "media");
const mediaService = new MediaService(db, mediaDir, nodeFs);

export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const userId = session.user.id;

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
          return Response.json({ error: "No file provided" }, { status: 400 });
        }

        try {
          const record = await mediaService.upload(userId, file);
          return Response.json(
            {
              id: record.id,
              filename: record.filename,
              url: `/api/media/${record.filename}`,
              mimeType: record.mimeType,
              size: record.size,
            },
            { status: 201 },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
