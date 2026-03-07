import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../../lib/auth-middleware";
import { NoteTypeService } from "../../../../lib/services/note-type-service";
import { db } from "../../../../db";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/templates/$templateId")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        await requireSession(request);
        const body = (await request.json()) as {
          questionTemplate?: string;
          answerTemplate?: string;
        };
        const template = await noteTypeService.updateTemplate(
          params.templateId,
          body,
        );
        if (!template) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(template);
      },
      DELETE: async ({ request, params }) => {
        await requireSession(request);
        await noteTypeService.deleteTemplate(params.templateId);
        return new Response(undefined, { status: 204 });
      },
    },
  },
});
