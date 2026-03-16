import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../../lib/auth-middleware";
import { StudyService } from "../../../../lib/services/study-service";
import { db } from "../../../../db";

const studyService = new StudyService(db);

export const Route = createFileRoute("/api/study/preview/$cardId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const cardId = Number(params.cardId);
        if (Number.isNaN(cardId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        const result = await studyService.getIntervalPreviews(
          session.user.id,
          cardId,
        );

        if (!result) {
          return Response.json({ error: "Card not found" }, { status: 404 });
        }

        return Response.json(result);
      },
    },
  },
});
