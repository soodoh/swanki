import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { media } from "@swanki/core/db/schema";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { requireSession } from "../../../../lib/auth-middleware";

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

				const record = db.select().from(media).where(eq(media.id, hash)).get();

				if (!record) {
					return Response.json(
						{ error: "Media record not found" },
						{ status: 404 },
					);
				}

				const buffer = await request.arrayBuffer();
				const bytes = new Uint8Array(buffer);

				mkdirSync(mediaDir, { recursive: true });
				const filePath = join(mediaDir, record.filename);
				writeFileSync(filePath, bytes);

				return Response.json({ ok: true });
			},
		},
	},
});
