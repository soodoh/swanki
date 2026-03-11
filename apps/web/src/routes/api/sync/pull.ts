import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { SyncService } from "../../../lib/services/sync-service";
import { db } from "../../../db";

const syncService = new SyncService(db);

export const Route = createFileRoute("/api/sync/pull")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const url = new URL(request.url);
        const since = url.searchParams.get("since");

        if (since) {
          const sinceMs = Number(since);
          if (Number.isNaN(sinceMs) || sinceMs <= 0) {
            return Response.json(
              { error: "Invalid 'since' parameter" },
              { status: 400 },
            );
          }
          const data = syncService.pullDelta(session.user.id, sinceMs);
          return Response.json(data);
        }

        const data = syncService.pullFull(session.user.id);
        return Response.json(data);
      },
    },
  },
});
