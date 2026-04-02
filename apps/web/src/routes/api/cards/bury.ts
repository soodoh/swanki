import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { requireSession } from "../../../lib/auth-middleware";
import { CardService } from "../../../lib/services/card-service";

const cardService = new CardService(db);

export const Route = createFileRoute("/api/cards/bury")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await requireSession(request);
				const body = (await request.json()) as {
					cardIds?: string[];
					bury?: boolean;
				};
				if (!Array.isArray(body.cardIds) || body.cardIds.length === 0) {
					return Response.json({ error: "cardIds required" }, { status: 400 });
				}
				await (body.bury === false
					? cardService.unburyCards(body.cardIds, session.user.id)
					: cardService.buryCards(body.cardIds, session.user.id));
				return Response.json({ success: true });
			},
		},
	},
});
