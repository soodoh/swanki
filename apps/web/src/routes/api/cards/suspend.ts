import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { CardService } from "../../../lib/services/card-service";
import { db } from "../../../db";

const cardService = new CardService(db);

export const Route = createFileRoute("/api/cards/suspend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          cardIds?: string[];
          suspend?: boolean;
        };
        if (!Array.isArray(body.cardIds) || body.cardIds.length === 0) {
          return Response.json({ error: "cardIds required" }, { status: 400 });
        }
        if (typeof body.suspend !== "boolean") {
          return Response.json(
            { error: "suspend (boolean) required" },
            { status: 400 },
          );
        }
        await cardService.suspendCards(
          body.cardIds,
          session.user.id,
          body.suspend,
        );
        return Response.json({ success: true });
      },
    },
  },
});
