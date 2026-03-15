import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { saveUpload } from "../../../lib/services/upload-service";
import { detectFormat } from "../../../lib/services/import-service";

const uploadDir: string = join(process.cwd(), "data", "uploads");

export const Route = createFileRoute("/api/import/upload")({
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

          const result = await saveUpload(uploadDir, userId, file);

          return Response.json({
            fileId: result.fileId,
            filename: file.name,
            size: file.size,
            format: result.format,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
