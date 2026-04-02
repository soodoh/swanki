import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { requireSession } from "../../../lib/auth-middleware";
import { CardService } from "../../../lib/services/card-service";

const cardService = new CardService(db);

export const Route = createFileRoute("/api/cards/$cardId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await requireSession(request);
				const cardId = params.cardId;
				const result = await cardService.getById(cardId, session.user.id);
				if (!result) {
					return Response.json({ error: "Not found" }, { status: 404 });
				}
				return Response.json(result);
			},
		},
	},
});
