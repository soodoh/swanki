import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { NoteTypeService } from "../../lib/services/note-type-service";
import { generateId } from "../../lib/id";
import { notes, cardTemplates } from "../../db/schema";
import { eq } from "drizzle-orm";

type TestDb = ReturnType<typeof createTestDb>;

describe("NoteTypeService", () => {
  let db: TestDb;
  let service: NoteTypeService;
  const userId = "user-1";

  beforeEach(() => {
    db = createTestDb();
    service = new NoteTypeService(db);
  });

  describe("create", () => {
    it("creates a note type and returns it", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });

      expect(noteType).toBeDefined();
      expect(noteType.id).toBeDefined();
      expect(noteType.name).toBe("Basic");
      expect(noteType.userId).toBe(userId);
      expect(noteType.fields).toStrictEqual([
        { name: "Front", ordinal: 0 },
        { name: "Back", ordinal: 1 },
      ]);
      expect(noteType.css).toBe("");
      expect(noteType.createdAt).toBeInstanceOf(Date);
      expect(noteType.updatedAt).toBeInstanceOf(Date);
    });

    it("creates a note type with custom css", async () => {
      const noteType = await service.create(userId, {
        name: "Styled",
        fields: [{ name: "Front", ordinal: 0 }],
        css: ".card { font-size: 20px; }",
      });

      expect(noteType.css).toBe(".card { font-size: 20px; }");
    });
  });

  describe("addTemplate", () => {
    it("adds a card template to a note type", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });

      const template = await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.noteTypeId).toBe(noteType.id);
      expect(template.name).toBe("Card 1");
      expect(template.questionTemplate).toBe("{{Front}}");
      expect(template.answerTemplate).toBe("{{Back}}");
      expect(template.ordinal).toBe(0);
    });

    it("assigns incrementing ordinals to templates", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });

      const t1 = await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });
      const t2 = await service.addTemplate(noteType.id, userId, {
        name: "Card 2",
        questionTemplate: "{{Back}}",
        answerTemplate: "{{Front}}",
      });

      expect(t1.ordinal).toBe(0);
      expect(t2.ordinal).toBe(1);
    });
  });

  describe("getById", () => {
    it("returns note type WITH its templates", async () => {
      const noteType = await service.create(userId, {
        name: "Basic (and reversed)",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });

      await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });
      await service.addTemplate(noteType.id, userId, {
        name: "Card 2",
        questionTemplate: "{{Back}}",
        answerTemplate: "{{Front}}",
      });

      const result = await service.getById(noteType.id, userId);

      expect(result).toBeDefined();
      expect(result!.noteType.id).toBe(noteType.id);
      expect(result!.noteType.name).toBe("Basic (and reversed)");
      expect(result!.templates).toHaveLength(2);
      expect(result!.templates[0].name).toBe("Card 1");
      expect(result!.templates[1].name).toBe("Card 2");
    });

    it("returns undefined for wrong user", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [{ name: "Front", ordinal: 0 }],
      });

      const result = await service.getById(noteType.id, "wrong-user");
      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent id", async () => {
      const result = await service.getById("non-existent", userId);
      expect(result).toBeUndefined();
    });
  });

  describe("listByUser", () => {
    it("returns all note types with templates for a user", async () => {
      const nt1 = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });
      await service.addTemplate(nt1.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      const nt2 = await service.create(userId, {
        name: "Cloze",
        fields: [{ name: "Text", ordinal: 0 }],
      });
      await service.addTemplate(nt2.id, userId, {
        name: "Cloze Card",
        questionTemplate: "{{cloze:Text}}",
        answerTemplate: "{{Text}}",
      });

      // Other user's note type
      await service.create("other-user", {
        name: "Other",
        fields: [{ name: "F", ordinal: 0 }],
      });

      const results = await service.listByUser(userId);

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.noteType.name).toSorted();
      expect(names).toStrictEqual(["Basic", "Cloze"]);

      for (const result of results) {
        expect(result.templates.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("updateTemplate", () => {
    it("updates a template's questionTemplate", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });
      const template = await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      const updated = await service.updateTemplate(template.id, userId, {
        questionTemplate: "<b>{{Front}}</b>",
      });

      expect(updated).toBeDefined();
      expect(updated!.questionTemplate).toBe("<b>{{Front}}</b>");
      expect(updated!.answerTemplate).toBe("{{Back}}");
    });

    it("updates a template's answerTemplate", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });
      const template = await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      const updated = await service.updateTemplate(template.id, userId, {
        answerTemplate: "<i>{{Back}}</i>",
      });

      expect(updated).toBeDefined();
      expect(updated!.answerTemplate).toBe("<i>{{Back}}</i>");
      expect(updated!.questionTemplate).toBe("{{Front}}");
    });

    it("returns undefined for non-existent template", async () => {
      const updated = await service.updateTemplate("non-existent", userId, {
        questionTemplate: "test",
      });

      expect(updated).toBeUndefined();
    });
  });

  describe("deleteTemplate", () => {
    it("removes a template", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });
      const template = await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      await service.deleteTemplate(template.id, userId);

      const remaining = await db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, noteType.id))
        .all();

      expect(remaining).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("updates the note type name", async () => {
      const noteType = await service.create(userId, {
        name: "Old Name",
        fields: [{ name: "Front", ordinal: 0 }],
      });

      const updated = await service.update(noteType.id, userId, {
        name: "New Name",
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe("New Name");
    });

    it("updates the note type fields", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [{ name: "Front", ordinal: 0 }],
      });

      const newFields = [
        { name: "Front", ordinal: 0 },
        { name: "Back", ordinal: 1 },
        { name: "Extra", ordinal: 2 },
      ];
      const updated = await service.update(noteType.id, userId, {
        fields: newFields,
      });

      expect(updated).toBeDefined();
      expect(updated!.fields).toStrictEqual(newFields);
    });

    it("updates the note type css", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [{ name: "Front", ordinal: 0 }],
      });

      const updated = await service.update(noteType.id, userId, {
        css: ".card { color: red; }",
      });

      expect(updated).toBeDefined();
      expect(updated!.css).toBe(".card { color: red; }");
    });

    it("returns undefined for wrong user", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [{ name: "Front", ordinal: 0 }],
      });

      const updated = await service.update(noteType.id, "wrong-user", {
        name: "Nope",
      });

      expect(updated).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("deletes note type and its templates when no notes reference it", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });
      await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      await service.delete(noteType.id, userId);

      const result = await service.getById(noteType.id, userId);
      expect(result).toBeUndefined();

      const remainingTemplates = await db
        .select()
        .from(cardTemplates)
        .where(eq(cardTemplates.noteTypeId, noteType.id))
        .all();
      expect(remainingTemplates).toHaveLength(0);
    });

    it("throws an error when notes reference the type", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [
          { name: "Front", ordinal: 0 },
          { name: "Back", ordinal: 1 },
        ],
      });
      await service.addTemplate(noteType.id, userId, {
        name: "Card 1",
        questionTemplate: "{{Front}}",
        answerTemplate: "{{Back}}",
      });

      // Insert a note that references this note type
      const now = new Date();
      await db.insert(notes).values({
        id: generateId(),
        userId,
        noteTypeId: noteType.id,
        fields: { Front: "Hello", Back: "World" },
        createdAt: now,
        updatedAt: now,
      });

      await expect(service.delete(noteType.id, userId)).rejects.toThrow(
        "Cannot delete note type that is referenced by existing notes",
      );

      // Note type should still exist
      const result = await service.getById(noteType.id, userId);
      expect(result).toBeDefined();
    });

    it("does nothing for wrong user", async () => {
      const noteType = await service.create(userId, {
        name: "Basic",
        fields: [{ name: "Front", ordinal: 0 }],
      });

      await service.delete(noteType.id, "wrong-user");

      const result = await service.getById(noteType.id, userId);
      expect(result).toBeDefined();
    });
  });
});
