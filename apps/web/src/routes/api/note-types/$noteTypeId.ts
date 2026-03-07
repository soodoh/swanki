import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { NoteTypeService } from "../../../lib/services/note-type-service";
import { db } from "../../../db";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/$noteTypeId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await requireSession(request);
        const result = noteTypeService.getById(
          params.noteTypeId,
          session.user.id,
        );
        if (!result) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(result);
      },
      PUT: async ({ request, params }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          name?: string;
          fields?: Array<{ name: string; ordinal: number }>;
          css?: string;
        };
        const noteType = noteTypeService.update(
          params.noteTypeId,
          session.user.id,
          body,
        );
        if (!noteType) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(noteType);
      },
      DELETE: async ({ request, params }) => {
        const session = await requireSession(request);
        try {
          noteTypeService.delete(params.noteTypeId, session.user.id);
          return new Response(undefined, { status: 204 });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("Cannot delete note type")
          ) {
            return Response.json({ error: error.message }, { status: 409 });
          }
          throw error;
        }
      },
    },
  },
});
