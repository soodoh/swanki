import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { CardService } from "../../../lib/services/card-service";
import { db } from "../../../db";

const cardService = new CardService(db);

export const Route = createFileRoute("/api/cards/$cardId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const result = await cardService.getById(
          params.cardId,
          session.user.id,
        );
        if (!result) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(result);
      },
    },
  },
});
