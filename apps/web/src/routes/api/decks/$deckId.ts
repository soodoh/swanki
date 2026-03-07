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
        const deck = await deckService.getById(params.deckId, session.user.id);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as { name?: string };
        const deck = await deckService.update(
          params.deckId,
          session.user.id,
          body,
        );
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        await deckService.delete(params.deckId, session.user.id);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
