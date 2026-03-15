import { unzipSync, strFromU8 } from "fflate";

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
  mergeStats?: {
    newNotes: number;
    updatedNotes: number;
    unchangedNotes: number;
  };
};

export type CrowdAnkiNoteModel = {
  uuid: string;
  name: string;
  fields: Array<{ name: string; ordinal: number }>;
  templates: Array<{
    name: string;
    questionFormat: string;
    answerFormat: string;
    ordinal: number;
  }>;
  css: string;
};

export type CrowdAnkiNote = {
  fields: string[];
  tags: string[];
  noteModelUuid: string;
  guid: string;
};

export type CrowdAnkiData = {
  name: string;
  children: CrowdAnkiData[];
  noteModels: CrowdAnkiNoteModel[];
  notes: CrowdAnkiNote[];
  mediaFiles: string[];
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return value;
  }
  return fallback;
}

export function parseCrowdAnki(json: unknown): CrowdAnkiData {
  if (typeof json !== "object" || json === undefined || json === null) {
    throw new Error("Invalid CrowdAnki data: expected an object");
  }

  const obj = json as Record<string, unknown>;

  const name = asString(obj.name);

  const children = Array.isArray(obj.children)
    ? obj.children.map((child: unknown) => parseCrowdAnki(child))
    : [];

  const noteModels = parseNoteModels(obj.note_models);
  const notes = parseNotes(obj.notes);
  const mediaFiles = Array.isArray(obj.media_files)
    ? (obj.media_files as string[])
    : [];

  return { name, children, noteModels, notes, mediaFiles };
}

function parseNoteModels(raw: unknown): CrowdAnkiNoteModel[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((model: Record<string, unknown>) => ({
    uuid: asString(model.crowdanki_uuid),
    name: asString(model.name),
    fields: Array.isArray(model.flds)
      ? (model.flds as Array<Record<string, unknown>>).map((f) => ({
          name: asString(f.name),
          ordinal: asNumber(f.ord),
        }))
      : [],
    templates: Array.isArray(model.tmpls)
      ? (model.tmpls as Array<Record<string, unknown>>).map((t) => ({
          name: asString(t.name),
          questionFormat: asString(t.qfmt),
          answerFormat: asString(t.afmt),
          ordinal: asNumber(t.ord),
        }))
      : [],
    css: asString(model.css),
  }));
}

function parseNotes(raw: unknown): CrowdAnkiNote[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((note: Record<string, unknown>) => ({
    fields: Array.isArray(note.fields) ? (note.fields as string[]) : [],
    tags: Array.isArray(note.tags) ? (note.tags as string[]) : [],
    noteModelUuid: asString(note.note_model_uuid),
    guid: asString(note.guid),
  }));
}

// --- ZIP support ---

type CrowdAnkiZipResult = {
  json: unknown;
  mediaEntries: Array<{ filename: string; data: Uint8Array }>;
};

/** Locate deck.json at root or one level deep (e.g. DeckName/deck.json). */
function findDeckJson(
  unzipped: Record<string, Uint8Array>,
): string | undefined {
  // Check root
  if (unzipped["deck.json"]) {
    return "deck.json";
  }
  // Check one level deep
  for (const key of Object.keys(unzipped)) {
    const parts = key.split("/");
    if (parts.length === 2 && parts[1] === "deck.json") {
      return key;
    }
  }
  return undefined;
}

/** Full extraction for server-side import — parses JSON + extracts media. */
export function parseCrowdAnkiZip(buffer: ArrayBuffer): CrowdAnkiZipResult {
  const unzipped = unzipSync(new Uint8Array(buffer));
  const deckJsonPath = findDeckJson(unzipped);
  if (!deckJsonPath) {
    throw new Error(
      "No deck.json found in ZIP (expected at root or inside a single directory)",
    );
  }

  const json: unknown = JSON.parse(strFromU8(unzipped[deckJsonPath]));

  // Extract media files (everything that's not deck.json or a directory)
  const prefix = deckJsonPath.includes("/")
    ? deckJsonPath.slice(0, deckJsonPath.lastIndexOf("/") + 1)
    : "";
  const mediaEntries: CrowdAnkiZipResult["mediaEntries"] = [];
  for (const [path, data] of Object.entries(unzipped)) {
    if (path === deckJsonPath) {
      continue;
    }
    if (path.endsWith("/")) {
      continue;
    } // directory entry
    // Strip directory prefix to get bare filename
    let filename =
      prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
    // CrowdAnki ZIPs may nest media in a media/ subdirectory —
    // strip it so filenames match note field references
    if (filename.startsWith("media/")) {
      filename = filename.slice("media/".length);
    }
    if (filename && data.length > 0) {
      mediaEntries.push({ filename, data });
    }
  }

  return { json, mediaEntries };
}

// --- Client-side preview ---

const MAX_NOTES_PER_TYPE = 5;
const MAX_TOTAL_NOTES = 10;

function collectDecks(data: CrowdAnkiData): Array<{ name: string }> {
  const result: Array<{ name: string }> = [{ name: data.name }];
  for (const child of data.children) {
    result.push(...collectDecks(child));
  }
  return result;
}

function collectNotes(data: CrowdAnkiData): CrowdAnkiNote[] {
  const result = [...data.notes];
  for (const child of data.children) {
    result.push(...collectNotes(child));
  }
  return result;
}

function countTotalCards(data: CrowdAnkiData): number {
  let total = 0;
  // Each note produces one card per template of its note model
  const templateCounts = new Map<string, number>();
  for (const model of data.noteModels) {
    templateCounts.set(model.uuid, model.templates.length);
  }
  for (const note of data.notes) {
    total += templateCounts.get(note.noteModelUuid) ?? 1;
  }
  for (const child of data.children) {
    total += countTotalCards(child);
  }
  return total;
}

/** Lightweight client-side preview — unzips only deck.json, skips media. */
export function buildCrowdAnkiPreview(buffer: ArrayBuffer): ApkgPreviewData {
  const unzipped = unzipSync(new Uint8Array(buffer), {
    filter: (file) => file.name.endsWith("deck.json"),
  });

  const deckJsonPath = findDeckJson(unzipped);
  if (!deckJsonPath) {
    throw new Error(
      "No deck.json found in ZIP (expected at root or inside a single directory)",
    );
  }

  const json: unknown = JSON.parse(strFromU8(unzipped[deckJsonPath]));
  const data = parseCrowdAnki(json);

  const allNotes = collectNotes(data);

  // Build model UUID → model map
  const modelMap = new Map<string, CrowdAnkiNoteModel>();
  for (const model of data.noteModels) {
    modelMap.set(model.uuid, model);
  }

  // Group notes by model
  const notesByModel = new Map<string, CrowdAnkiNote[]>();
  for (const note of allNotes) {
    const existing = notesByModel.get(note.noteModelUuid);
    if (existing) {
      existing.push(note);
    } else {
      notesByModel.set(note.noteModelUuid, [note]);
    }
  }

  // Sample notes
  const sampleNotes: ApkgPreviewData["sampleNotes"] = [];
  for (const model of data.noteModels) {
    if (sampleNotes.length >= MAX_TOTAL_NOTES) {
      break;
    }
    const modelNotes = notesByModel.get(model.uuid) ?? [];
    const limit = Math.min(
      MAX_NOTES_PER_TYPE,
      MAX_TOTAL_NOTES - sampleNotes.length,
    );
    for (let i = 0; i < Math.min(modelNotes.length, limit); i += 1) {
      const note = modelNotes[i];
      const fields: Record<string, string> = {};
      for (const field of model.fields) {
        fields[field.name] = note.fields[field.ordinal] ?? "";
      }
      sampleNotes.push({ noteTypeName: model.name, fields });
    }
  }

  return {
    decks: collectDecks(data),
    noteTypes: data.noteModels.map((m) => ({
      name: m.name,
      fields: m.fields,
      templates: m.templates.map((t) => ({
        name: t.name,
        questionFormat: t.questionFormat,
        answerFormat: t.answerFormat,
        ordinal: t.ordinal,
      })),
      css: m.css,
    })),
    sampleNotes,
    totalCards: countTotalCards(data),
    totalNotes: allNotes.length,
    totalMedia: data.mediaFiles.length,
  };
}
