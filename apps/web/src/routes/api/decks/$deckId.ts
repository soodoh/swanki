import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { DeckService } from "../../../lib/services/deck-service";
import { nodeFs } from "@swanki/core/node-filesystem";
import { db } from "../../../db";

const mediaDir: string = join(process.cwd(), "data", "media");
const deckService = new DeckService(db, mediaDir, nodeFs);

export const Route = createFileRoute("/api/decks/$deckId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = params.deckId;
        const deck = await deckService.getById(deckId, session.user.id);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = params.deckId;
        const body = (await request.json()) as {
          name?: string;
          description?: string;
          parentId?: string | undefined;
          settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
        };
        const deck = await deckService.update(deckId, session.user.id, body);
        if (!deck) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(deck);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = params.deckId;
        await deckService.delete(deckId, session.user.id);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
