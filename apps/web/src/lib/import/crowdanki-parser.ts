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
