import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { requireSession } from "../../../lib/auth-middleware";
import { detectFormat } from "../../../lib/services/import-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import type { ApkgNoteType, ApkgNote } from "../../../lib/import/apkg-parser";
import { countMedia } from "../../../lib/import/apkg-parser-core";
import { db } from "../../../db";
import { notes } from "../../../db/schema";
import { stripHtmlToPlainText } from "../../../lib/field-converter";

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
    /** Fields with HTML stripped to plain text + media refs. */
    fields: Record<string, string>;
  }>;
  totalCards: number;
  totalNotes: number;
  totalMedia: number;
  mergeStats?: {
    newNotes: number;
    updatedNotes: number;
    unchangedNotes: number;
  };
};

const MAX_NOTES_PER_TYPE = 5;
const MAX_TOTAL_NOTES = 10;

function buildSampleNotes(
  noteTypes: ApkgNoteType[],
  allNotes: ApkgNote[],
): ApkgPreviewData["sampleNotes"] {
  const notesByModel = new Map<number, ApkgNote[]>();
  for (const note of allNotes) {
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
        // Strip HTML from sample fields to match how they'll be stored
        fields[field.name] = stripHtmlToPlainText(
          note.fields[field.ordinal] ?? "",
        );
      }
      samples.push({ noteTypeName: nt.name, fields });
    }
  }

  return samples;
}

/* oxlint-disable unicorn/prefer-string-replace-all -- replaceAll with regex isn't typed in this TS target */
/** Remove media bracket tags so comparison focuses on text content only. */
function stripMediaRefs(text: string): string {
  return text
    .replace(/\[(?:image|audio|video):[^\]]+\]/g, "")
    .replace(/  +/g, " ")
    .trim();
}
/* oxlint-enable unicorn/prefer-string-replace-all */

function computeMergeStats(
  apkgData: ReturnType<typeof parseApkg>,
  userId: string,
): NonNullable<ApkgPreviewData["mergeStats"]> {
  const existingNotes = db
    .select({
      ankiGuid: notes.ankiGuid,
      fields: notes.fields,
    })
    .from(notes)
    .where(eq(notes.userId, userId))
    .all();

  const existingMap = new Map<string, Record<string, string>>();
  for (const n of existingNotes) {
    if (n.ankiGuid) {
      existingMap.set(n.ankiGuid, n.fields);
    }
  }

  const noteTypeById = new Map(apkgData.noteTypes.map((nt) => [nt.id, nt]));

  let newNotes = 0;
  let updatedNotes = 0;
  let unchangedNotes = 0;
  for (const ankiNote of apkgData.notes) {
    if (!ankiNote.guid || !existingMap.has(ankiNote.guid)) {
      newNotes += 1;
    } else {
      const nt = noteTypeById.get(ankiNote.modelId);
      const incomingFields: Record<string, string> = {};
      if (nt) {
        for (const field of nt.fields) {
          incomingFields[field.name] = ankiNote.fields[field.ordinal] ?? "";
        }
      }

      // Strip HTML from incoming fields to match stored format
      const strippedFields: Record<string, string> = {};
      for (const key of Object.keys(incomingFields)) {
        strippedFields[key] = stripHtmlToPlainText(incomingFields[key]);
      }

      const storedFields = existingMap.get(ankiNote.guid)!;
      const fieldsMatch =
        Object.keys(storedFields).length ===
          Object.keys(strippedFields).length &&
        Object.keys(storedFields).every(
          (k) =>
            stripMediaRefs(storedFields[k] ?? "") ===
            stripMediaRefs(strippedFields[k] ?? ""),
        );

      if (fieldsMatch) {
        unchangedNotes += 1;
      } else {
        updatedNotes += 1;
      }
    }
  }
  return { newNotes, updatedNotes, unchangedNotes };
}

export const Route = createFileRoute("/api/import/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireSession(request);
        const userId = session.user.id;

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
          const mergeMode = (formData.get("mergeMode") as string) || undefined;

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
          // Skip decompressing media binary data — only need DB + manifest
          const apkgData = parseApkg(buffer, { skipMedia: true });

          let mergeStats: ApkgPreviewData["mergeStats"];
          if (mergeMode === "merge") {
            mergeStats = computeMergeStats(apkgData, userId);
          }

          // Count media from manifest without reading binary data
          const totalMedia = apkgData._unzipped
            ? countMedia(apkgData._unzipped)
            : apkgData.media.length;

          const preview: ApkgPreviewData = {
            decks: apkgData.decks.map((d) => ({ name: d.name })),
            noteTypes: apkgData.noteTypes.map((nt) => ({
              name: nt.name,
              fields: nt.fields,
              templates: nt.templates.map((tmpl) => ({
                name: tmpl.name,
                questionFormat: tmpl.questionFormat,
                answerFormat: tmpl.answerFormat,
                ordinal: tmpl.ordinal,
              })),
              css: nt.css,
            })),
            sampleNotes: buildSampleNotes(apkgData.noteTypes, apkgData.notes),
            totalCards: apkgData.cards.length,
            totalNotes: apkgData.notes.length,
            totalMedia,
            mergeStats,
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
