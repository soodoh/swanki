import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../../db";
import { requireSession } from "../../../../lib/auth-middleware";
import { NoteTypeService } from "../../../../lib/services/note-type-service";

const noteTypeService = new NoteTypeService(db);

export const Route = createFileRoute("/api/note-types/templates/")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await requireSession(request);
				const userId = session.user.id;
				const body = (await request.json()) as {
					noteTypeId: string;
					name: string;
					questionTemplate: string;
					answerTemplate: string;
				};
				const template = await noteTypeService.addTemplate(
					body.noteTypeId,
					userId,
					{
						name: body.name,
						questionTemplate: body.questionTemplate,
						answerTemplate: body.answerTemplate,
					},
				);
				if (!template) {
					return Response.json({ error: "Not found" }, { status: 404 });
				}
				return Response.json(template, { status: 201 });
			},
		},
	},
});
