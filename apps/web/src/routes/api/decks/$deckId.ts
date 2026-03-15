import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { DeckService } from "../../../lib/services/deck-service";
import { db } from "../../../db";

const mediaDir: string = join(process.cwd(), "data", "media");
const deckService = new DeckService(db, mediaDir);

export const Route = createFileRoute("/api/decks/$deckId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = Number(params.deckId);
        if (Number.isNaN(deckId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        const deck = deckService.getById(deckId, session.user.id);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = Number(params.deckId);
        if (Number.isNaN(deckId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        const body = (await request.json()) as {
          name?: string;
          description?: string;
          parentId?: number | undefined;
          settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
        };
        const deck = deckService.update(deckId, session.user.id, body);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = Number(params.deckId);
        if (Number.isNaN(deckId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        deckService.delete(deckId, session.user.id);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
