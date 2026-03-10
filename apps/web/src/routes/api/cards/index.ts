import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { CardService } from "../../../lib/services/card-service";
import { db } from "../../../db";

const cardService = new CardService(db);

export const Route = createFileRoute("/api/cards/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const url = new URL(request.url);
        const deckId = url.searchParams.get("deckId");

        if (!deckId) {
          return Response.json(
            { error: "deckId query parameter is required" },
            { status: 400 },
          );
        }

        const counts = url.searchParams.get("counts");
        if (counts === "true") {
          const result = cardService.getDueCounts(session.user.id, deckId, {
            includeChildren: true,
          });
          return Response.json(result);
        }

        const includeChildren =
          url.searchParams.get("includeChildren") === "true";
        const dueCards = cardService.getDueCards(session.user.id, deckId, {
          includeChildren,
        });
        return Response.json(dueCards);
      },
    },
  },
});
