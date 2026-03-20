import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../../lib/auth-middleware";
import { NoteTypeService } from "../../../../lib/services/note-type-service";
import { db } from "../../../../db";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/$noteTypeId/sample-note")(
  {
    server: {
      handlers: {
        GET: async ({ request, params }) => {
          const session = await requireSession(request);
          const noteTypeId = params.noteTypeId;
          const fields = await noteTypeService.getFirstNoteFields(
            noteTypeId,
            session.user.id,
          );
          return Response.json({ fields });
        },
      },
    },
  },
);
