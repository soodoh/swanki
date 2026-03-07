import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { StudyService } from "../../../lib/services/study-service";
import { db } from "../../../db";
import type { Grade } from "../../../lib/fsrs";

const studyService = new StudyService(db);

export const Route = createFileRoute("/api/study/review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          cardId?: string;
          rating?: number;
          timeTakenMs?: number;
        };

        if (!body.cardId || !body.rating || body.timeTakenMs === undefined) {
          return Response.json(
            { error: "cardId, rating, and timeTakenMs are required" },
            { status: 400 },
          );
        }

        if (body.rating < 1 || body.rating > 4) {
          return Response.json(
            { error: "rating must be between 1 and 4" },
            { status: 400 },
          );
        }

        try {
          const result = studyService.submitReview(
            session.user.id,
            body.cardId,
            body.rating as Grade,
            body.timeTakenMs,
          );
          return Response.json(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return Response.json({ error: message }, { status: 404 });
        }
      },
    },
  },
});
