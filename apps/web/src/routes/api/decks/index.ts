import { join } from "node:path";
import { nodeFs } from "@swanki/core/node-filesystem";
import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { requireSession } from "../../../lib/auth-middleware";
import { DeckService } from "../../../lib/services/deck-service";

const mediaDir: string = join(process.cwd(), "data", "media");
const deckService = new DeckService(db, mediaDir, nodeFs);

export const Route = createFileRoute("/api/decks/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await requireSession(request);
				const tree = await deckService.getTree(session.user.id);
				return Response.json(tree);
			},
			POST: async ({ request }) => {
				const session = await requireSession(request);
				const body = (await request.json()) as {
					name: string;
					parentId?: string;
				};
				const deck = await deckService.create(session.user.id, body);
				return Response.json(deck, { status: 201 });
			},
		},
	},
});
