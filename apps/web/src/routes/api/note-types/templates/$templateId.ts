import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../../db";
import { requireSession } from "../../../../lib/auth-middleware";
import { NoteTypeService } from "../../../../lib/services/note-type-service";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/templates/$templateId")({
	server: {
		handlers: {
			PUT: async ({ request, params }) => {
				const session = await requireSession(request);
				const userId = session.user.id;
				const templateId = params.templateId;
				const body = (await request.json()) as {
					questionTemplate?: string;
					answerTemplate?: string;
				};
				const template = await noteTypeService.updateTemplate(
					templateId,
					userId,
					body,
				);
				if (!template) {
					return Response.json({ error: "Not found" }, { status: 404 });
				}
				return Response.json(template);
			},
			DELETE: async ({ request, params }) => {
				const session = await requireSession(request);
				const userId = session.user.id;
				const templateId = params.templateId;
				await noteTypeService.deleteTemplate(templateId, userId);
				return new Response(undefined, { status: 204 });
			},
		},
	},
});
