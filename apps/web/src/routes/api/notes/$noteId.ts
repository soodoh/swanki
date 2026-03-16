import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { NoteService } from "../../../lib/services/note-service";
import { MediaService } from "../../../lib/services/media-service";
import { extractMediaFilenames } from "../../../lib/services/import-service";
import { nodeFs } from "@swanki/core/node-filesystem";
import { db } from "../../../db";

const mediaDir: string = join(process.cwd(), "data", "media");
const noteService = new NoteService(db);

export const Route = createFileRoute("/api/notes/$noteId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const noteId = Number(params.noteId);
        if (Number.isNaN(noteId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        const result = await noteService.getById(noteId, session.user.id);
        if (!result) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(result);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const noteId = Number(params.noteId);
        if (Number.isNaN(noteId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        const body = (await request.json()) as {
          fields?: Record<string, string>;
          tags?: string;
        };
        const note = await noteService.update(noteId, session.user.id, body);
        if (!note) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (body.fields) {
          const mediaService = new MediaService(db, mediaDir, nodeFs);
          const filenames = extractMediaFilenames(body.fields);
          await mediaService.reconcileNoteReferences(noteId, filenames);
        }
        return Response.json(note);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        const noteId = Number(params.noteId);
        if (Number.isNaN(noteId)) {
          return Response.json({ error: "Invalid ID" }, { status: 400 });
        }
        // Verify ownership before cleaning up media references
        const existing = await noteService.getById(noteId, session.user.id);
        if (!existing) {
          return new Response(undefined, { status: 204 });
        }
        const mediaService = new MediaService(db, mediaDir, nodeFs);
        await mediaService.reconcileNoteReferences(noteId, []);
        await noteService.delete(noteId, session.user.id);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
