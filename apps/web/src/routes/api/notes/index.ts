import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { NoteService } from "../../../lib/services/note-service";
import { db } from "../../../db";

const noteService = new NoteService(db);

export const Route = createFileRoute("/api/notes/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const url = new URL(request.url);
        const deckIdParam = url.searchParams.get("deckId");
        const query = url.searchParams.get("q");

        if (query) {
          const results = await noteService.search(session.user.id, query);
          return Response.json(results);
        }

        if (deckIdParam) {
          const deckId = Number(deckIdParam);
          if (Number.isNaN(deckId)) {
            return Response.json({ error: "Invalid deckId" }, { status: 400 });
          }
          const notes = await noteService.listByDeck(deckId, session.user.id);
          return Response.json(notes);
        }

        return Response.json(
          { error: "deckId or q query parameter is required" },
          { status: 400 },
        );
      },
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          noteTypeId: number;
          deckId: number;
          fields: Record<string, string>;
          tags?: string;
        };
        const note = await noteService.create(session.user.id, body);
        return Response.json(note, { status: 201 });
      },
    },
  },
});
