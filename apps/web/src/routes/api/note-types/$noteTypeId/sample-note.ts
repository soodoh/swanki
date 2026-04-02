import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../../db";
import { requireSession } from "../../../../lib/auth-middleware";
import { NoteTypeService } from "../../../../lib/services/note-type-service";

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
