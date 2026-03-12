import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { StudyService } from "../../../lib/services/study-service";
import { DeckService } from "../../../lib/services/deck-service";
import { db } from "../../../db";

const studyService = new StudyService(db);
const deckService = new DeckService(db);

export const Route = createFileRoute("/api/study/$deckId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const numericId = Number(params.deckId);

        let deckUuid: string;
        if (Number.isNaN(numericId)) {
          // Fallback: treat as UUID for backwards compatibility
          deckUuid = params.deckId;
        } else {
          const deck = deckService.getByNumericId(numericId, session.user.id);
          if (!deck) {
            return Response.json({ error: "Deck not found" }, { status: 404 });
          }
          deckUuid = deck.id;
        }

        const result = studyService.getStudySession(session.user.id, deckUuid);
        return Response.json(result);
      },
    },
  },
});
