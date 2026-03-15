import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requireSession } from "../../../lib/auth-middleware";
import { detectFormat } from "../../../lib/services/import-service";
import { getUploadPath } from "../../../lib/services/upload-service";
import { parseApkg } from "../../../lib/import/apkg-parser";
import type { ApkgNoteType, ApkgNote } from "../../../lib/import/apkg-parser";
import { countMedia } from "../../../lib/import/apkg-parser-core";
import {
  parseCrowdAnkiZip,
  parseCrowdAnki,
} from "../../../lib/import/crowdanki-parser";
import type { CrowdAnkiData } from "../../../lib/import/crowdanki-parser";
import { db } from "../../../db";
import { notes } from "../../../db/schema";
import { stripHtmlToPlainText } from "../../../lib/field-converter";

const uploadDir: string = join(process.cwd(), "data", "uploads");

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

function collectAllNotes(data: CrowdAnkiData): CrowdAnkiData["notes"] {
  const result = [...data.notes];
  for (const child of data.children) {
    result.push(...collectAllNotes(child));
  }
  return result;
}

function computeCrowdAnkiMergeStats(
  data: CrowdAnkiData,
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

  const modelMap = new Map(data.noteModels.map((m) => [m.uuid, m]));
  const allNotes = collectAllNotes(data);

  let newNotes = 0;
  let updatedNotes = 0;
  let unchangedNotes = 0;

  for (const note of allNotes) {
    if (!note.guid || !existingMap.has(note.guid)) {
      newNotes += 1;
    } else {
      const model = modelMap.get(note.noteModelUuid);
      const incomingFields: Record<string, string> = {};
      if (model) {
        for (const field of model.fields) {
          incomingFields[field.name] = note.fields[field.ordinal] ?? "";
        }
      }

      const strippedFields: Record<string, string> = {};
      for (const key of Object.keys(incomingFields)) {
        strippedFields[key] = stripHtmlToPlainText(incomingFields[key]);
      }

      const storedFields = existingMap.get(note.guid)!;
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

          // Support both JSON body (with fileId) and multipart/form-data
          let buffer: ArrayBuffer;
          let format: ReturnType<typeof detectFormat>;
          let mergeMode: string | undefined;

          if (contentType.includes("application/json")) {
            // New path: read from previously uploaded file
            const body = (await request.json()) as {
              fileId?: string;
              mergeMode?: string;
            };
            if (!body.fileId) {
              return Response.json(
                { error: "fileId is required" },
                { status: 400 },
              );
            }
            mergeMode = body.mergeMode;

            const filePath = getUploadPath(uploadDir, userId, body.fileId);
            if (!filePath) {
              return Response.json(
                { error: "Upload not found or expired" },
                { status: 404 },
              );
            }

            const ext = filePath.slice(filePath.lastIndexOf("."));
            format = detectFormat(`file${ext}`);
            // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- node:fs is untyped in this project
            const fileData: Buffer = readFileSync(filePath);
            buffer = fileData.buffer.slice(
              fileData.byteOffset,
              fileData.byteOffset + fileData.byteLength,
            );
          } else if (contentType.includes("multipart/form-data")) {
            // Legacy path: file uploaded directly
            const formData = await request.formData();
            const file = formData.get("file");
            mergeMode = (formData.get("mergeMode") as string) || undefined;

            if (!(file instanceof File)) {
              return Response.json(
                { error: "No file provided" },
                { status: 400 },
              );
            }

            format = detectFormat(file.name);
            buffer = await file.arrayBuffer();
          } else {
            return Response.json(
              { error: "Expected application/json or multipart/form-data" },
              { status: 400 },
            );
          }

          if (
            format !== "apkg" &&
            format !== "colpkg" &&
            format !== "crowdanki"
          ) {
            return Response.json(
              { error: "Preview only supported for .apkg/.colpkg/.zip files" },
              { status: 400 },
            );
          }

          if (format === "crowdanki") {
            const { json } = parseCrowdAnkiZip(buffer);
            const data = parseCrowdAnki(json);
            const mergeStats = computeCrowdAnkiMergeStats(data, userId);
            return Response.json({ mergeStats });
          }

          // APKG/COLPKG path
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
