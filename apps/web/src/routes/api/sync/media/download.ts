import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { requireSession } from "../../../../lib/auth-middleware";
import { db } from "../../../../db";
import { eq } from "drizzle-orm";
import { media } from "@swanki/core/db/schema";

const mediaDir: string = join(process.cwd(), "data", "media");

export const Route = createFileRoute("/api/sync/media/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await requireSession(request);

        const url = new URL(request.url);
        const hash = url.searchParams.get("hash");
        if (!hash) {
          return Response.json(
            { error: "Missing 'hash' query parameter" },
            { status: 400 },
          );
        }

        const record = await db
          .select()
          .from(media)
          .where(eq(media.id, hash))
          .get();

        if (!record) {
          return Response.json(
            { error: "Media record not found" },
            { status: 404 },
          );
        }

        const filePath = join(mediaDir, record.filename);
        // oxlint-disable-next-line typescript/no-unsafe-call -- node:fs is untyped in this project
        if (!existsSync(filePath)) {
          return Response.json(
            { error: "File not found on disk" },
            { status: 404 },
          );
        }

        // oxlint-disable-next-line typescript/no-unsafe-call -- node:fs is untyped in this project
        const fileBuffer = readFileSync(filePath);
        return new Response(fileBuffer, {
          headers: {
            "Content-Type": record.mimeType,
            "Content-Length": String(record.size),
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
          },
        });
      },
    },
  },
});
