import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { StudyService } from "../../../lib/services/study-service";
import { db } from "../../../db";

const studyService = new StudyService(db);

export const Route = createFileRoute("/api/study/undo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as { cardId?: number };

        if (!body.cardId) {
          return Response.json(
            { error: "cardId is required" },
            { status: 400 },
          );
        }

        const result = studyService.undoLastReview(
          session.user.id,
          body.cardId,
        );

        if (!result) {
          return Response.json(
            { error: "No review to undo or card not found" },
            { status: 404 },
          );
        }

        return Response.json(result);
      },
    },
  },
});
