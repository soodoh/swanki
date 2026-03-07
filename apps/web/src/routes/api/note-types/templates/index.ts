import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../../lib/auth-middleware";
import { NoteTypeService } from "../../../../lib/services/note-type-service";
import { db } from "../../../../db";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/templates/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await requireSession(request);
        const body = (await request.json()) as {
          noteTypeId: string;
          name: string;
          questionTemplate: string;
          answerTemplate: string;
        };
        const template = await noteTypeService.addTemplate(body.noteTypeId, {
          name: body.name,
          questionTemplate: body.questionTemplate,
          answerTemplate: body.answerTemplate,
        });
        return Response.json(template, { status: 201 });
      },
    },
  },
});
