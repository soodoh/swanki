import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { StudyService } from "../../../lib/services/study-service";
import { db } from "../../../db";

const studyService = new StudyService(db);

export const Route = createFileRoute("/api/study/$deckId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const deckId = params.deckId;

        const result = await studyService.getStudySession(
          session.user.id,
          deckId,
        );
        return Response.json(result);
      },
    },
  },
});
