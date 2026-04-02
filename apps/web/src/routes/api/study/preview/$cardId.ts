import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../../db";
import { requireSession } from "../../../../lib/auth-middleware";
import { StudyService } from "../../../../lib/services/study-service";

const studyService = new StudyService(db);

export const Route = createFileRoute("/api/study/preview/$cardId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await requireSession(request);
				const cardId = params.cardId;
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
