import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { DeckService } from "../../../lib/services/deck-service";
import { db } from "../../../db";

const deckService = new DeckService(db);

export const Route = createFileRoute("/api/decks/$deckId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const deck = deckService.getById(params.deckId, session.user.id);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          name?: string;
          description?: string;
          parentId?: string | null;
          settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
        };
        const deck = deckService.update(params.deckId, session.user.id, body);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        deckService.delete(params.deckId, session.user.id);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
