import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe("Template preview rendering", () => {
  test.describe.configure({ mode: "serial" });

  let noteTypeId: string;

  /**
   * Helper: create a note type via API and return its ID.
   */
  async function createNoteType(
    page: Page,
    name: string,
    fields: string[],
    css?: string,
  ): Promise<string> {
    const res = await page.request.post("/api/note-types", {
      data: {
        name,
        fields: fields.map((f, i) => ({ name: f, ordinal: i })),
        css: css ?? "",
      },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  /**
   * Helper: create a card template via API.
   */
  async function createTemplate(
    page: Page,
    ntId: string,
    name: string,
    questionTemplate: string,
    answerTemplate: string,
  ): Promise<void> {
    const res = await page.request.post("/api/note-types/templates", {
      data: { noteTypeId: ntId, name, questionTemplate, answerTemplate },
    });
    expect(res.ok()).toBe(true);
  }

  /**
   * Helper: update CSS for a note type via API.
   */
  async function updateCss(
    page: Page,
    ntId: string,
    css: string,
  ): Promise<void> {
    const res = await page.request.put(`/api/note-types/${ntId}`, {
      data: { css },
    });
    expect(res.ok()).toBe(true);
  }

  /**
   * Helper: open the note type editor dialog and switch to the Preview tab.
   */
  async function openPreviewTab(page: Page, ntName: string): Promise<void> {
    await page.goto("/note-types", { waitUntil: "networkidle" });
    // Click the note type card to open the editor dialog
    await page.getByLabel(`Edit ${ntName}`).click();
    await expect(
      page.getByText("Edit fields, templates, and styling"),
    ).toBeVisible();
    // Switch to preview tab
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByText("Sample Data")).toBeVisible();
  }

  /**
   * Helper: set sample data for a field in the preview tab.
   */
  async function setSampleField(
    page: Page,
    fieldName: string,
    value: string,
  ): Promise<void> {
    const input = page.locator(`#sample-${fieldName}`);
    await input.clear();
    await input.fill(value);
  }

  /**
   * Helper: get the question preview card element.
   */
  function questionCard(page: Page) {
    return page
      .locator('[class*="card"]')
      .filter({ has: page.getByText("Question", { exact: true }) })
      .locator(".card");
  }

  /**
   * Helper: get the answer preview card element.
   */
  function answerCard(page: Page) {
    return page
      .locator('[class*="card"]')
      .filter({ has: page.getByText("Answer", { exact: true }) })
      .locator(".card");
  }

  test("setup: create note type with template", async ({ page }) => {
    // Create note type with Front, Back, Text fields
    noteTypeId = await createNoteType(page, "E2E Preview Test", [
      "Front",
      "Back",
      "Text",
    ]);
    expect(noteTypeId).toBeTruthy();

    // Create a basic template
    await createTemplate(
      page,
      noteTypeId,
      "Card 1",
      "{{Front}}",
      "{{FrontSide}}<hr>{{Back}}",
    );
  });

  test("basic field substitution renders in preview", async ({ page }) => {
    await openPreviewTab(page, "E2E Preview Test");

    // Default sample data is "(sample Front)" etc.
    const q = questionCard(page);
    const a = answerCard(page);

    await expect(q).toContainText("(sample Front)");
    await expect(a).toContainText("(sample Back)");

    // Change sample data and verify preview updates
    await setSampleField(page, "Front", "What is 2+2?");
    await setSampleField(page, "Back", "4");

    await expect(q).toContainText("What is 2+2?");
    await expect(a).toContainText("4");
  });

  test("FrontSide renders question content in answer", async ({ page }) => {
    await openPreviewTab(page, "E2E Preview Test");

    await setSampleField(page, "Front", "Capital of France?");
    await setSampleField(page, "Back", "Paris");

    const a = answerCard(page);

    // Answer template is {{FrontSide}}<hr>{{Back}} — should contain the question
    await expect(a).toContainText("Capital of France?");
    await expect(a).toContainText("Paris");
    // The <hr> should be rendered as a separator
    await expect(a.locator("hr")).toBeVisible();
  });

  test("media tags render as img and audio elements", async ({ page }) => {
    await openPreviewTab(page, "E2E Preview Test");

    // Set sample data with media bracket tags
    await setSampleField(page, "Front", "Look: [image:photo.jpg]");
    await setSampleField(page, "Back", "Listen: [audio:sound.mp3]");

    const q = questionCard(page);
    const a = answerCard(page);

    // Image should render as <img> with /api/media/ URL
    const img = q.locator("img");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", "/api/media/photo.jpg");

    // Audio should render as audio element with /api/media/ URL
    const audio = a.locator("audio");
    await expect(audio).toHaveAttribute("src", "/api/media/sound.mp3");
  });

  test("conditional blocks show/hide based on field content", async ({
    page,
  }) => {
    // Update template to use conditionals
    const res = await page.request.get(`/api/note-types/${noteTypeId}`);
    const data = (await res.json()) as {
      templates: Array<{ id: string }>;
    };
    const templateId = data.templates[0].id;

    await page.request.put(`/api/note-types/templates/${templateId}`, {
      data: {
        questionTemplate:
          "{{Front}}{{#Back}}<div class='hint'>Hint: {{Back}}</div>{{/Back}}",
        answerTemplate: "{{Back}}",
      },
    });

    await openPreviewTab(page, "E2E Preview Test");

    // With Back filled — conditional content should be visible
    await setSampleField(page, "Front", "Question");
    await setSampleField(page, "Back", "Answer here");

    const q = questionCard(page);
    await expect(q).toContainText("Hint: Answer here");

    // Clear Back — conditional content should be hidden
    await setSampleField(page, "Back", "");

    await expect(q).not.toContainText("Hint:");
    await expect(q).toContainText("Question");
  });

  test("cloze deletion renders correctly", async ({ page }) => {
    // Update template to use cloze
    const res = await page.request.get(`/api/note-types/${noteTypeId}`);
    const data = (await res.json()) as {
      templates: Array<{ id: string }>;
    };
    const templateId = data.templates[0].id;

    await page.request.put(`/api/note-types/templates/${templateId}`, {
      data: {
        questionTemplate: "{{cloze:Text}}",
        answerTemplate: "{{cloze:Text}}",
      },
    });

    await openPreviewTab(page, "E2E Preview Test");

    await setSampleField(
      page,
      "Text",
      "{{c1::Paris}} is the capital of France",
    );

    const q = questionCard(page);
    const a = answerCard(page);

    // Question side: cloze should show [...] placeholder
    await expect(q).toContainText("[...]");
    await expect(q).toContainText("is the capital of France");
    await expect(q).not.toContainText("Paris");

    // Answer side: cloze should show the answer with cloze styling
    await expect(a).toContainText("Paris");
    await expect(a).toContainText("is the capital of France");
    await expect(a.locator(".cloze")).toContainText("Paris");
  });

  test("cloze with hint shows hint text on question side", async ({ page }) => {
    await openPreviewTab(page, "E2E Preview Test");

    await setSampleField(
      page,
      "Text",
      "{{c1::Paris::city name}} is the capital of France",
    );

    const q = questionCard(page);

    // Hint should appear instead of [...]
    await expect(q).toContainText("[city name]");
    await expect(q).not.toContainText("Paris");
  });

  test("custom CSS is applied in preview", async ({ page }) => {
    // Set custom CSS on the note type
    await updateCss(
      page,
      noteTypeId,
      ".card { text-align: left; } .highlight { color: red; font-weight: bold; }",
    );

    // Update template to use a class
    const res = await page.request.get(`/api/note-types/${noteTypeId}`);
    const data = (await res.json()) as {
      templates: Array<{ id: string }>;
    };
    const templateId = data.templates[0].id;

    await page.request.put(`/api/note-types/templates/${templateId}`, {
      data: {
        questionTemplate: '<span class="highlight">{{Front}}</span>',
        answerTemplate: "{{Back}}",
      },
    });

    await openPreviewTab(page, "E2E Preview Test");

    await setSampleField(page, "Front", "Styled text");

    // Verify CSS is present in the page via a <style> tag
    const styleTag = page.locator("style");
    await expect(styleTag.first()).toBeAttached();

    // Verify the highlight class is rendered
    const q = questionCard(page);
    const highlight = q.locator(".highlight");
    await expect(highlight).toContainText("Styled text");

    // Verify computed style is actually applied (color: red)
    const color = await highlight.evaluate(
      (el) => globalThis.getComputedStyle(el).color,
    );
    expect(color).toBe("rgb(255, 0, 0)");
  });

  test("multiple cloze deletions render independently", async ({ page }) => {
    // Update template for cloze
    const res = await page.request.get(`/api/note-types/${noteTypeId}`);
    const data = (await res.json()) as {
      templates: Array<{ id: string }>;
    };
    const templateId = data.templates[0].id;

    await page.request.put(`/api/note-types/templates/${templateId}`, {
      data: {
        questionTemplate: "{{cloze:Text}}",
        answerTemplate: "{{cloze:Text}}",
      },
    });

    await openPreviewTab(page, "E2E Preview Test");

    await setSampleField(
      page,
      "Text",
      "{{c1::Paris}} is the capital of {{c2::France}}",
    );

    const q = questionCard(page);

    // For card ordinal 1: c1 is hidden, c2 is shown
    await expect(q).toContainText("[...]");
    await expect(q).toContainText("France");
    await expect(q).not.toContainText("Paris");
  });

  test("nested HTML in templates renders correctly", async ({ page }) => {
    const res = await page.request.get(`/api/note-types/${noteTypeId}`);
    const data = (await res.json()) as {
      templates: Array<{ id: string }>;
    };
    const templateId = data.templates[0].id;

    await page.request.put(`/api/note-types/templates/${templateId}`, {
      data: {
        questionTemplate:
          '<div style="font-size: 24px">{{Front}}</div><ul><li>Item 1</li><li>Item 2</li></ul>',
        answerTemplate: "<table><tr><td>{{Back}}</td></tr></table>",
      },
    });

    await openPreviewTab(page, "E2E Preview Test");

    await setSampleField(page, "Front", "Big text");
    await setSampleField(page, "Back", "Table cell");

    const q = questionCard(page);
    const a = answerCard(page);

    // List items should render
    await expect(q.locator("li").first()).toContainText("Item 1");
    await expect(q.locator("li").nth(1)).toContainText("Item 2");

    // Table should render
    await expect(a.locator("td")).toContainText("Table cell");
  });
});
