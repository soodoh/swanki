import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { requireSession } from "../../../../lib/auth-middleware";
import { db } from "../../../../db";
import { eq } from "drizzle-orm";
import { media } from "@swanki/core/db/schema";

const mediaDir: string = join(process.cwd(), "data", "media");

export const Route = createFileRoute("/api/sync/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await requireSession(request);

        const hash = request.headers.get("X-Media-Hash");
        if (!hash) {
          return Response.json(
            { error: "Missing X-Media-Hash header" },
            { status: 400 },
          );
        }

        // oxlint-disable-next-line typescript/await-thenable -- Drizzle ORM returns thenable
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

        const buffer = await request.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // oxlint-disable-next-line typescript/no-unsafe-call -- node:fs is untyped in this project
        mkdirSync(mediaDir, { recursive: true });
        const filePath = join(mediaDir, record.filename);
        // oxlint-disable-next-line typescript/no-unsafe-call -- node:fs is untyped in this project
        writeFileSync(filePath, bytes);

        return Response.json({ ok: true });
      },
    },
  },
});
