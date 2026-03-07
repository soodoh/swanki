import { describe, it, expect } from "vitest";
import { parseCrowdAnki } from "../../../lib/import/crowdanki-parser";

function makeFixture(overrides?: Record<string, unknown>) {
  return {
    name: "Test Deck",
    children: [],
    note_models: [
      {
        crowdanki_uuid: "model-uuid-1",
        name: "Basic",
        flds: [
          { name: "Front", ord: 0 },
          { name: "Back", ord: 1 },
        ],
        tmpls: [
          {
            name: "Card 1",
            qfmt: "{{Front}}",
            afmt: "{{FrontSide}}<hr>{{Back}}",
            ord: 0,
          },
        ],
        css: ".card { font-family: arial; }",
      },
    ],
    notes: [
      {
        fields: ["hello", "world"],
        tags: ["tag1", "tag2"],
        note_model_uuid: "model-uuid-1",
        guid: "abc123",
      },
    ],
    ...overrides,
  };
}

describe("parseCrowdAnki", () => {
  it("parses deck name", () => {
    const data = parseCrowdAnki(makeFixture());

    expect(data.name).toBe("Test Deck");
  });

  it("parses children (nested decks)", () => {
    const fixture = makeFixture({
      children: [
        {
          name: "Child Deck",
          children: [],
          note_models: [],
          notes: [],
        },
        {
          name: "Another Child",
          children: [
            {
              name: "Grandchild",
              children: [],
              note_models: [],
              notes: [],
            },
          ],
          note_models: [],
          notes: [],
        },
      ],
    });

    const data = parseCrowdAnki(fixture);

    expect(data.children).toHaveLength(2);
    expect(data.children[0].name).toBe("Child Deck");
    expect(data.children[1].name).toBe("Another Child");
    expect(data.children[1].children).toHaveLength(1);
    expect(data.children[1].children[0].name).toBe("Grandchild");
  });

  it("parses note models (note types)", () => {
    const data = parseCrowdAnki(makeFixture());

    expect(data.noteModels).toHaveLength(1);
    expect(data.noteModels[0].uuid).toBe("model-uuid-1");
    expect(data.noteModels[0].name).toBe("Basic");
    expect(data.noteModels[0].fields).toStrictEqual([
      { name: "Front", ordinal: 0 },
      { name: "Back", ordinal: 1 },
    ]);
    expect(data.noteModels[0].templates).toHaveLength(1);
    expect(data.noteModels[0].templates[0]).toStrictEqual({
      name: "Card 1",
      questionFormat: "{{Front}}",
      answerFormat: "{{FrontSide}}<hr>{{Back}}",
      ordinal: 0,
    });
    expect(data.noteModels[0].css).toBe(".card { font-family: arial; }");
  });

  it("parses notes with fields", () => {
    const data = parseCrowdAnki(makeFixture());

    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].fields).toStrictEqual(["hello", "world"]);
    expect(data.notes[0].tags).toStrictEqual(["tag1", "tag2"]);
    expect(data.notes[0].noteModelUuid).toBe("model-uuid-1");
    expect(data.notes[0].guid).toBe("abc123");
  });

  it("handles media references in notes", () => {
    const fixture = makeFixture({
      notes: [
        {
          fields: ['<img src="image.jpg">', "back text"],
          tags: [],
          note_model_uuid: "model-uuid-1",
          guid: "media-note",
        },
      ],
      media_files: ["image.jpg", "audio.mp3"],
    });

    const data = parseCrowdAnki(fixture);

    expect(data.notes[0].fields[0]).toContain("image.jpg");
    expect(data.mediaFiles).toStrictEqual(["image.jpg", "audio.mp3"]);
  });

  it("handles multiple note models", () => {
    const fixture = makeFixture({
      note_models: [
        {
          crowdanki_uuid: "model-1",
          name: "Basic",
          flds: [
            { name: "Front", ord: 0 },
            { name: "Back", ord: 1 },
          ],
          tmpls: [
            { name: "Card 1", qfmt: "{{Front}}", afmt: "{{Back}}", ord: 0 },
          ],
          css: "",
        },
        {
          crowdanki_uuid: "model-2",
          name: "Cloze",
          flds: [
            { name: "Text", ord: 0 },
            { name: "Extra", ord: 1 },
          ],
          tmpls: [
            {
              name: "Cloze",
              qfmt: "{{cloze:Text}}",
              afmt: "{{cloze:Text}}<br>{{Extra}}",
              ord: 0,
            },
          ],
          css: ".cloze { color: blue; }",
        },
      ],
    });

    const data = parseCrowdAnki(fixture);

    expect(data.noteModels).toHaveLength(2);
    expect(data.noteModels[0].name).toBe("Basic");
    expect(data.noteModels[1].name).toBe("Cloze");
    expect(data.noteModels[1].css).toBe(".cloze { color: blue; }");
  });

  it("handles empty notes array", () => {
    const fixture = makeFixture({ notes: [] });
    const data = parseCrowdAnki(fixture);

    expect(data.notes).toStrictEqual([]);
  });

  it("handles missing media_files", () => {
    const fixture = makeFixture();
    // No media_files key
    const data = parseCrowdAnki(fixture);

    expect(data.mediaFiles).toStrictEqual([]);
  });

  it("throws on invalid input", () => {
    expect(() => parseCrowdAnki("not an object")).toThrow(
      "Invalid CrowdAnki data",
    );
    expect(() => parseCrowdAnki(42)).toThrow("Invalid CrowdAnki data");
  });
});
