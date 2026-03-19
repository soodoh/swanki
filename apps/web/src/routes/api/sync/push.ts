import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { SyncService } from "../../../lib/services/sync-service";
import { db } from "../../../db";

const syncService = new SyncService(db);

export const Route = createFileRoute("/api/sync/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = await request.json();
        const result = await syncService.push(session.user.id, body);
        return Response.json(result);
      },
    },
  },
});
