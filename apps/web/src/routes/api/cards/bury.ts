import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { CardService } from "../../../lib/services/card-service";
import { db } from "../../../db";

const cardService = new CardService(db);

export const Route = createFileRoute("/api/cards/bury")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          cardIds?: number[];
          bury?: boolean;
        };
        if (!Array.isArray(body.cardIds) || body.cardIds.length === 0) {
          return Response.json({ error: "cardIds required" }, { status: 400 });
        }
        if (body.bury === false) {
          await cardService.unburyCards(body.cardIds, session.user.id);
        } else {
          await cardService.buryCards(body.cardIds, session.user.id);
        }
        return Response.json({ success: true });
      },
    },
  },
});
