import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { NoteService } from "../../../lib/services/note-service";
import { MediaService } from "../../../lib/services/media-service";
import { extractMediaFilenames } from "../../../lib/services/import-service";
import { db } from "../../../db";

const noteService = new NoteService(db);

export const Route = createFileRoute("/api/notes/$noteId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const result = noteService.getById(params.noteId, session.user.id);
        if (!result) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(result);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          fields?: Record<string, string>;
          tags?: string;
        };
        const note = noteService.update(params.noteId, session.user.id, body);
        if (!note) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (body.fields) {
          const mediaService = new MediaService(db);
          const filenames = extractMediaFilenames(body.fields);
          mediaService.reconcileNoteReferences(params.noteId, filenames);
        }
        return Response.json(note);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        const mediaService = new MediaService(db);
        mediaService.reconcileNoteReferences(params.noteId, []);
        noteService.delete(params.noteId, session.user.id);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
