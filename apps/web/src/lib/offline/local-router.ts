/**
 * Maps endpoint patterns to local SQL.js query/mutation functions.
 * Used by WebTransport to resolve offline-capable operations.
 */
import type { LocalDrizzleDb } from "./local-drizzle";
import * as localQueries from "./local-queries";
import * as localMutations from "./local-mutations";
import { decks as decksTable } from "../../db/schema";

/**
 * Resolve an API endpoint + params to a local query function.
 * Returns undefined if the endpoint has no local implementation.
 */
export function resolveLocalQuery(
  endpoint: string,
  params?: Record<string, string>,
): ((db: LocalDrizzleDb) => unknown) | undefined {
  // GET /api/decks
  if (endpoint === "/api/decks") {
    return (db) => localQueries.getDecksTree(db);
  }

  // GET /api/cards?deckId=X&counts=true
  if (
    endpoint === "/api/cards" &&
    params?.counts === "true" &&
    params?.deckId
  ) {
    const deckId = Number(params.deckId);
    return (db) => localQueries.getDeckCounts(db, deckId);
  }

  // GET /api/study/preview/X
  const previewMatch = endpoint.match(/^\/api\/study\/preview\/(\d+)$/);
  if (previewMatch) {
    const cardId = Number(previewMatch[1]);
    return (db) => localQueries.getIntervalPreviews(db, cardId);
  }

  // GET /api/study/X
  const studyMatch = endpoint.match(/^\/api\/study\/(\d+)$/);
  if (studyMatch) {
    const deckId = Number(studyMatch[1]);
    return (db) => localQueries.getStudySession(db, deckId);
  }

  // GET /api/browse?noteId=X (note detail)
  if (endpoint === "/api/browse" && params?.noteId) {
    const noteId = Number(params.noteId);
    return (db) => localQueries.getNoteDetail(db, noteId);
  }

  // GET /api/browse?q=...&page=...&limit=...
  if (endpoint === "/api/browse") {
    const query = params?.q ?? "";
    const page = Number(params?.page ?? "1");
    const limit = Number(params?.limit ?? "50");
    return (db) => localQueries.browseSearch(db, query, page, limit);
  }

  // GET /api/stats?type=reviews&days=X
  if (endpoint === "/api/stats" && params?.type === "reviews" && params?.days) {
    const days = Number(params.days);
    return (db) => localQueries.getReviewsPerDay(db, days);
  }

  // GET /api/stats?type=states
  if (endpoint === "/api/stats" && params?.type === "states") {
    return (db) => localQueries.getCardStates(db);
  }

  // GET /api/stats?type=streak
  if (endpoint === "/api/stats" && params?.type === "streak") {
    return (db) => localQueries.getStreak(db);
  }

  // GET /api/stats?type=heatmap&year=X
  if (endpoint === "/api/stats" && params?.type === "heatmap" && params?.year) {
    const year = Number(params.year);
    return (db) => localQueries.getHeatmap(db, year);
  }

  // GET /api/note-types
  if (endpoint === "/api/note-types") {
    return (db) => localQueries.getNoteTypes(db);
  }

  // GET /api/note-types/X/sample-note
  const sampleMatch = endpoint.match(/^\/api\/note-types\/(\d+)\/sample-note$/);
  if (sampleMatch) {
    const noteTypeId = Number(sampleMatch[1]);
    return (db) => localQueries.getFirstNoteFields(db, noteTypeId);
  }

  // GET /api/note-types/X
  const noteTypeMatch = endpoint.match(/^\/api\/note-types\/(\d+)$/);
  if (noteTypeMatch) {
    const id = Number(noteTypeMatch[1]);
    return (db) => localQueries.getNoteType(db, id);
  }

  return undefined;
}

/**
 * Resolve an API endpoint + method + body to a local mutation function.
 * Returns undefined if the endpoint has no local implementation.
 *
 * The returned function receives (db, body) and applies the mutation locally.
 */
export function resolveLocalMutation(
  endpoint: string,
  method: string,
  body: unknown,
): ((db: LocalDrizzleDb, input: unknown) => void) | undefined {
  // POST /api/decks — create deck
  if (endpoint === "/api/decks" && method === "POST") {
    return (db, input) => {
      const data = input as { name: string; parentId?: number };
      const id = crypto.randomUUID();
      // Look up userId from an existing deck
      const row = db
        .select({ userId: decksTable.userId })
        .from(decksTable)
        .limit(1)
        .get();
      const userId = row?.userId ?? "";
      localMutations.createDeck(db, {
        id,
        userId,
        name: data.name,
        parentId: data.parentId,
      });
    };
  }

  // PUT /api/decks/X — update deck
  const updateDeckMatch = endpoint.match(/^\/api\/decks\/(\d+)$/);
  if (updateDeckMatch && method === "PUT") {
    const deckId = Number(updateDeckMatch[1]);
    return (db, input) => {
      const data = input as {
        name?: string;
        description?: string;
        parentId?: number | null;
        settings?: { newCardsPerDay: number; maxReviewsPerDay: number };
      };
      localMutations.updateDeck(db, deckId, data);
    };
  }

  // DELETE /api/decks/X — delete deck
  const deleteDeckMatch = endpoint.match(/^\/api\/decks\/(\d+)$/);
  if (deleteDeckMatch && method === "DELETE") {
    const deckId = Number(deleteDeckMatch[1]);
    return (db) => {
      localMutations.deleteDeck(db, deckId);
    };
  }

  // POST /api/study/review — submit review
  if (endpoint === "/api/study/review" && method === "POST") {
    return (db, input) => {
      const data = input as {
        cardId: number;
        rating: number;
        timeTakenMs: number;
      };
      localMutations.submitReview(
        db,
        data.cardId,
        data.rating,
        data.timeTakenMs,
      );
    };
  }

  // POST /api/study/undo — undo review
  if (endpoint === "/api/study/undo" && method === "POST") {
    return (db, input) => {
      const data = input as { cardId: number };
      localMutations.undoReview(db, data.cardId);
    };
  }

  // PATCH /api/browse — update note
  if (endpoint === "/api/browse" && method === "PATCH") {
    return (db, input) => {
      const data = input as {
        noteId: number;
        fields?: Record<string, string>;
        deckId?: number;
      };
      localMutations.updateNote(db, data.noteId, {
        fields: data.fields,
        deckId: data.deckId,
      });
    };
  }

  // DELETE /api/browse — delete note
  if (endpoint === "/api/browse" && method === "DELETE") {
    return (db, input) => {
      const data = input as { noteId: number };
      localMutations.deleteNote(db, data.noteId);
    };
  }

  return undefined;
}
