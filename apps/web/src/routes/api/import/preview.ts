import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { detectFormat } from "../../../lib/services/import-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import type { ApkgNoteType, ApkgNote } from "../../../lib/import/apkg-parser";

export type ApkgPreviewData = {
  decks: Array<{ name: string }>;
  noteTypes: Array<{
    name: string;
    fields: Array<{ name: string; ordinal: number }>;
    templates: Array<{
      name: string;
      questionFormat: string;
      answerFormat: string;
      ordinal: number;
    }>;
    css: string;
  }>;
  sampleNotes: Array<{
    noteTypeName: string;
    fields: Record<string, string>;
  }>;
  totalCards: number;
  totalNotes: number;
  totalMedia: number;
};

const MAX_NOTES_PER_TYPE = 5;
const MAX_TOTAL_NOTES = 10;

function buildSampleNotes(
  noteTypes: ApkgNoteType[],
  notes: ApkgNote[],
): ApkgPreviewData["sampleNotes"] {
  const notesByModel = new Map<number, ApkgNote[]>();
  for (const note of notes) {
    const existing = notesByModel.get(note.modelId);
    if (existing) {
      existing.push(note);
    } else {
      notesByModel.set(note.modelId, [note]);
    }
  }

  const samples: ApkgPreviewData["sampleNotes"] = [];

  for (const nt of noteTypes) {
    if (samples.length >= MAX_TOTAL_NOTES) {
      break;
    }

    const ntNotes = notesByModel.get(nt.id) ?? [];
    const limit = Math.min(
      MAX_NOTES_PER_TYPE,
      MAX_TOTAL_NOTES - samples.length,
    );

    for (let i = 0; i < Math.min(ntNotes.length, limit); i += 1) {
      const note = ntNotes[i];
      const fields: Record<string, string> = {};
      for (const field of nt.fields) {
        fields[field.name] = note.fields[field.ordinal] ?? "";
      }
      samples.push({ noteTypeName: nt.name, fields });
    }
  }

  return samples;
}

export const Route = createFileRoute("/api/import/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await requireSession(request);

        try {
          const contentType = request.headers.get("content-type") ?? "";
          if (!contentType.includes("multipart/form-data")) {
            return Response.json(
              { error: "Expected multipart/form-data" },
              { status: 400 },
            );
          }

          const formData = await request.formData();
          const file = formData.get("file");

          if (!(file instanceof File)) {
            return Response.json(
              { error: "No file provided" },
              { status: 400 },
            );
          }

          const format = detectFormat(file.name);
          if (format !== "apkg" && format !== "colpkg") {
            return Response.json(
              { error: "Preview only supported for .apkg/.colpkg files" },
              { status: 400 },
            );
          }

          const buffer = await file.arrayBuffer();
          const apkgData = parseApkg(buffer);

          const preview: ApkgPreviewData = {
            decks: apkgData.decks.map((d) => ({ name: d.name })),
            noteTypes: apkgData.noteTypes.map((nt) => ({
              name: nt.name,
              fields: nt.fields,
              templates: nt.templates,
              css: nt.css,
            })),
            sampleNotes: buildSampleNotes(apkgData.noteTypes, apkgData.notes),
            totalCards: apkgData.cards.length,
            totalNotes: apkgData.notes.length,
            totalMedia: apkgData.media.length,
          };

          return Response.json(preview);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Preview failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
