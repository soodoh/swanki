import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { RENDERER_URL } from "./global-setup";

// ---------------------------------------------------------------------------
// IPC helpers — replace page.request.* with window.electronAPI.invoke calls
// ---------------------------------------------------------------------------

async function ipcMutate<T>(
  page: Page,
  endpoint: string,
  method: string,
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    ([ep, m, b]) =>
      (
        window as unknown as {
          electronAPI: {
            invoke: (ch: string, a: unknown) => Promise<unknown>;
          };
        }
      ).electronAPI.invoke("db:mutate", {
        endpoint: ep,
        method: m,
        body: b,
      }),
    [endpoint, method, body] as [string, string, unknown],
  ) as Promise<T>;
}

async function ipcQuery<T>(
  page: Page,
  endpoint: string,
  params?: Record<string, string>,
): Promise<T> {
  return page.evaluate(
    ([ep, p]) =>
      (
        window as unknown as {
          electronAPI: {
            invoke: (ch: string, a: unknown) => Promise<unknown>;
          };
        }
      ).electronAPI.invoke("db:query", {
        endpoint: ep,
        params: p,
      }),
    [endpoint, params] as [string, Record<string, string> | undefined],
  ) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Per-test setup helpers
// ---------------------------------------------------------------------------

async function createNoteType(
  page: Page,
  name: string,
  fields: string[],
  css?: string,
): Promise<string> {
  const result = await ipcMutate<{ id: string }>(
    page,
    "/api/note-types",
    "POST",
    {
      name,
      fields: fields.map((f, i) => ({ name: f, ordinal: i })),
      css: css ?? "",
    },
  );
  return result.id;
}

async function createTemplate(
  page: Page,
  ntId: string,
  name: string,
  questionTemplate: string,
  answerTemplate: string,
): Promise<void> {
  await ipcMutate(page, "/api/note-types/templates", "POST", {
    noteTypeId: ntId,
    name,
    questionTemplate,
    answerTemplate,
  });
}

async function updateCss(page: Page, ntId: string, css: string): Promise<void> {
  await ipcMutate(page, `/api/note-types/${ntId}`, "PUT", { css });
}

async function updateNoteFields(
  page: Page,
  noteId: string,
  fields: Record<string, string>,
): Promise<void> {
  await ipcMutate(page, `/api/notes/${noteId}`, "PUT", { fields });
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

function questionCard(page: Page) {
  return page
    .getByText("Question Preview", { exact: true })
    .locator("xpath=..")
    .locator(".prose");
}

function answerCard(page: Page) {
  return page
    .getByText("Answer Preview", { exact: true })
    .locator("xpath=..")
    .locator(".prose");
}

async function openPreviewTab(page: Page, ntName: string): Promise<void> {
  // Reload to clear the React Query cache so the preview fetches fresh DB data
  // (the Electron app is a single long-running process shared across serial tests).
  await page.goto(`${RENDERER_URL}/note-types`, { waitUntil: "load" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel(`Edit ${ntName}`).first().click();
  await expect(
    page.getByText("Edit fields, templates, and styling"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByText("Question Preview")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Template preview rendering", () => {
  test.describe.configure({ mode: "serial" });

  let noteTypeId: string;
  let noteId: string;

  test("setup: create note type with template and sample note", async ({
    page,
  }) => {
    noteTypeId = await createNoteType(page, "E2E Preview Test", [
      "Front",
      "Back",
      "Text",
    ]);
    expect(noteTypeId).toBeTruthy();

    await createTemplate(
      page,
      noteTypeId,
      "Card 1",
      "{{Front}}",
      "{{FrontSide}}<hr>{{Back}}",
    );

    const deck = await ipcMutate<{ id: string }>(page, "/api/decks", "POST", {
      name: "E2E Preview Deck",
    });
    expect(deck.id).toBeTruthy();

    const note = await ipcMutate<{ id: string }>(page, "/api/notes", "POST", {
      noteTypeId,
      deckId: deck.id,
      fields: { Front: "Hello", Back: "World", Text: "Sample text" },
    });
    expect(note.id).toBeTruthy();
    noteId = note.id;
  });

  test("basic field substitution renders in preview", async ({ page }) => {
    await updateNoteFields(page, noteId, {
      Front: "What is 2+2?",
      Back: "4",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");

    await expect(questionCard(page)).toContainText("What is 2+2?");
    await expect(answerCard(page)).toContainText("4");
  });

  test("FrontSide renders question content in answer", async ({ page }) => {
    await updateNoteFields(page, noteId, {
      Front: "Capital of France?",
      Back: "Paris",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");

    const a = answerCard(page);
    await expect(a).toContainText("Capital of France?");
    await expect(a).toContainText("Paris");
    await expect(a.locator("hr")).toBeVisible();
  });

  test("media tags render as img and audio elements", async ({ page }) => {
    await updateNoteFields(page, noteId, {
      Front: "Look: [image:photo.jpg]",
      Back: "Listen: [audio:sound.mp3]",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");

    const img = questionCard(page).locator("img");
    await expect(img).toBeVisible();
    // Desktop serves media via swanki-media:// not /api/media/
    await expect(img).toHaveAttribute("src", "swanki-media://media/photo.jpg");

    const audio = answerCard(page).locator("audio");
    await expect(audio).toHaveAttribute(
      "src",
      "swanki-media://media/sound.mp3",
    );
  });

  test("conditional blocks show/hide based on field content", async ({
    page,
  }) => {
    const data = await ipcQuery<{ templates: Array<{ id: string }> }>(
      page,
      `/api/note-types/${noteTypeId}`,
    );
    const templateId = data.templates[0].id;

    await ipcMutate(page, `/api/note-types/templates/${templateId}`, "PUT", {
      questionTemplate:
        "{{Front}}{{#Back}}<div class='hint'>Hint: {{Back}}</div>{{/Back}}",
      answerTemplate: "{{Back}}",
    });

    await updateNoteFields(page, noteId, {
      Front: "Question",
      Back: "Answer here",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");
    await expect(questionCard(page)).toContainText("Hint: Answer here");

    await updateNoteFields(page, noteId, {
      Front: "Question",
      Back: "",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");
    await expect(questionCard(page)).not.toContainText("Hint:");
    await expect(questionCard(page)).toContainText("Question");
  });

  test("cloze deletion renders correctly", async ({ page }) => {
    const data = await ipcQuery<{ templates: Array<{ id: string }> }>(
      page,
      `/api/note-types/${noteTypeId}`,
    );
    const templateId = data.templates[0].id;

    await ipcMutate(page, `/api/note-types/templates/${templateId}`, "PUT", {
      questionTemplate: "{{cloze:Text}}",
      answerTemplate: "{{cloze:Text}}",
    });

    await updateNoteFields(page, noteId, {
      Front: "",
      Back: "",
      Text: "{{c1::Paris}} is the capital of France",
    });
    await openPreviewTab(page, "E2E Preview Test");

    const q = questionCard(page);
    const a = answerCard(page);

    await expect(q).toContainText("[...]");
    await expect(q).toContainText("is the capital of France");
    await expect(q).not.toContainText("Paris");

    await expect(a).toContainText("Paris");
    await expect(a).toContainText("is the capital of France");
    await expect(a.locator(".cloze")).toContainText("Paris");
  });

  test("cloze with hint shows hint text on question side", async ({ page }) => {
    await updateNoteFields(page, noteId, {
      Front: "",
      Back: "",
      Text: "{{c1::Paris::city name}} is the capital of France",
    });
    await openPreviewTab(page, "E2E Preview Test");

    const q = questionCard(page);
    await expect(q).toContainText("[city name]");
    await expect(q).not.toContainText("Paris");
  });

  test("custom CSS is applied in preview", async ({ page }) => {
    await updateCss(
      page,
      noteTypeId,
      ".card { text-align: left; } .highlight { color: red; font-weight: bold; }",
    );

    const data = await ipcQuery<{ templates: Array<{ id: string }> }>(
      page,
      `/api/note-types/${noteTypeId}`,
    );
    const templateId = data.templates[0].id;

    await ipcMutate(page, `/api/note-types/templates/${templateId}`, "PUT", {
      questionTemplate: '<span class="highlight">{{Front}}</span>',
      answerTemplate: "{{Back}}",
    });

    await updateNoteFields(page, noteId, {
      Front: "Styled text",
      Back: "Answer",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");

    const styleTag = page.locator("style");
    await expect(styleTag.first()).toBeAttached();

    const highlight = questionCard(page).locator(".highlight");
    await expect(highlight).toContainText("Styled text");

    const color = await highlight.evaluate(
      (el) => globalThis.getComputedStyle(el).color,
    );
    expect(color).toBe("rgb(255, 0, 0)");
  });

  test("multiple cloze deletions render independently", async ({ page }) => {
    const data = await ipcQuery<{ templates: Array<{ id: string }> }>(
      page,
      `/api/note-types/${noteTypeId}`,
    );
    const templateId = data.templates[0].id;

    await ipcMutate(page, `/api/note-types/templates/${templateId}`, "PUT", {
      questionTemplate: "{{cloze:Text}}",
      answerTemplate: "{{cloze:Text}}",
    });

    await updateNoteFields(page, noteId, {
      Front: "",
      Back: "",
      Text: "{{c1::Paris}} is the capital of {{c2::France}}",
    });
    await openPreviewTab(page, "E2E Preview Test");

    const q = questionCard(page);
    await expect(q).toContainText("[...]");
    await expect(q).toContainText("France");
    await expect(q).not.toContainText("Paris");
  });

  test("nested HTML in templates renders correctly", async ({ page }) => {
    const data = await ipcQuery<{ templates: Array<{ id: string }> }>(
      page,
      `/api/note-types/${noteTypeId}`,
    );
    const templateId = data.templates[0].id;

    await ipcMutate(page, `/api/note-types/templates/${templateId}`, "PUT", {
      questionTemplate:
        '<div style="font-size: 24px">{{Front}}</div><ul><li>Item 1</li><li>Item 2</li></ul>',
      answerTemplate: "<table><tr><td>{{Back}}</td></tr></table>",
    });

    await updateNoteFields(page, noteId, {
      Front: "Big text",
      Back: "Table cell",
      Text: "",
    });
    await openPreviewTab(page, "E2E Preview Test");

    await expect(questionCard(page).locator("li").first()).toContainText(
      "Item 1",
    );
    await expect(questionCard(page).locator("li").nth(1)).toContainText(
      "Item 2",
    );
    await expect(answerCard(page).locator("td")).toContainText("Table cell");
  });
});
