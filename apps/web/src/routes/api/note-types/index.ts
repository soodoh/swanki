import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { NoteTypeService } from "../../../lib/services/note-type-service";
import { db } from "../../../db";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const noteTypes = await noteTypeService.listByUser(session.user.id);
        return Response.json(noteTypes);
      },
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          name: string;
          fields: Array<{ name: string; ordinal: number }>;
          css?: string;
        };
        const noteType = await noteTypeService.create(session.user.id, body);
        return Response.json(noteType, { status: 201 });
      },
    },
  },
});
