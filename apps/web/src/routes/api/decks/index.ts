import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { DeckService } from "../../../lib/services/deck-service";
import { db } from "../../../db";

const deckService = new DeckService(db);

export const Route = createFileRoute("/api/decks/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const tree = await deckService.getTree(session.user.id);
        return Response.json(tree);
      },
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          name: string;
          parentId?: string;
        };
        const deck = await deckService.create(session.user.id, body);
        return Response.json(deck, { status: 201 });
      },
    },
  },
});
