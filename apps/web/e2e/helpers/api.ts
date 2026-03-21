import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function createDeck(
  page: Page,
  data: { name: string; parentId?: string },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/decks", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

export async function deleteDeck(page: Page, deckId: string): Promise<void> {
  const res = await page.request.delete(`/api/decks/${deckId}`);
  expect(res.status()).toBe(204);
}

export async function createNoteType(
  page: Page,
  data: { name: string; fields: string[]; css?: string },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/note-types", {
    data: {
      name: data.name,
      fields: data.fields.map((f, i) => ({ name: f, ordinal: i })),
      css: data.css ?? "",
    },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

export async function deleteNoteType(
  page: Page,
  noteTypeId: string,
): Promise<void> {
  const res = await page.request.delete(`/api/note-types/${noteTypeId}`);
  expect(res.status()).toBe(204);
}

export async function createNote(
  page: Page,
  data: { noteTypeId: string; deckId: string; fields: Record<string, string> },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/notes", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}

export async function deleteNote(page: Page, noteId: string): Promise<void> {
  const res = await page.request.delete(`/api/notes/${noteId}`);
  expect(res.status()).toBe(204);
}

export async function createTemplate(
  page: Page,
  data: {
    noteTypeId: string;
    name: string;
    questionTemplate: string;
    answerTemplate: string;
  },
): Promise<{ id: string }> {
  const res = await page.request.post("/api/note-types/templates", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { id: string };
}
