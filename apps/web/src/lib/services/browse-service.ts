import { eq, and, lte, like, sql, or, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";
import {
  cards,
  notes,
  decks,
  noteTypes,
  cardTemplates,
  reviewLogs,
} from "../../db/schema";
import { parseSearchQuery } from "../search-parser";
import type { SearchNode } from "../search-parser";

type Db = BunSQLiteDatabase<typeof schema>;

type Card = typeof cards.$inferSelect;
type Note = typeof notes.$inferSelect;
type NoteType = typeof noteTypes.$inferSelect;
type CardTemplate = typeof cardTemplates.$inferSelect;
type ReviewLog = typeof reviewLogs.$inferSelect;

export type BrowseNote = {
  noteId: string;
  noteTypeId: string;
  noteTypeName: string;
  fields: Record<string, string>;
  tags: string;
  deckName: string;
  deckId: string;
  cardCount: number;
  earliestDue: string | undefined;
  states: number[];
  createdAt: string;
  updatedAt: string;
};

export type BrowseSearchResult = {
  notes: BrowseNote[];
  total: number;
  page: number;
  limit: number;
};

export type CardDetail = {
  card: Card;
  note: Note;
  noteType: NoteType;
  templates: CardTemplate[];
  recentReviews: ReviewLog[];
  deckName: string;
};

export type SearchOptions = {
  page?: number;
  limit?: number;
  sortBy?: "due" | "created" | "updated";
  sortDir?: "asc" | "desc";
};

function stateToCondition(value: string): SQL | undefined {
  switch (value) {
    case "new":
      return eq(cards.state, 0);
    case "review":
      return eq(cards.state, 2);
    case "due":
      return lte(cards.due, new Date());
    default:
      return undefined;
  }
}

function nodeToCondition(node: SearchNode): SQL | undefined {
  // oxlint-disable-next-line default-case -- switch is exhaustive over SearchNode union type
  switch (node.type) {
    case "deck":
      return eq(decks.name, node.value);

    case "tag":
      // Tags are stored as space-separated strings in notes.tags
      // Match: the tag is the entire string, or starts with it, or ends with it, or is in the middle
      return or(
        eq(notes.tags, node.value),
        like(notes.tags, `${node.value} %`),
        like(notes.tags, `% ${node.value}`),
        like(notes.tags, `% ${node.value} %`),
      );

    case "state":
      return stateToCondition(node.value);

    case "text":
      if (node.value === "") {
        return undefined;
      }
      // Search in serialized JSON fields using LIKE
      return like(notes.fields, `%${node.value}%`);

    case "negate": {
      const inner = nodeToCondition(node.child);
      if (!inner) {
        return undefined;
      }
      return sql`NOT (${inner})`;
    }

    case "and": {
      const andConditions = node.children
        .map((child) => nodeToCondition(child))
        .filter((c): c is SQL => c !== undefined);
      if (andConditions.length === 0) {
        return undefined;
      }
      if (andConditions.length === 1) {
        return andConditions[0];
      }
      return and(...andConditions);
    }

    case "or": {
      const orConditions = node.children
        .map((child) => nodeToCondition(child))
        .filter((c): c is SQL => c !== undefined);
      if (orConditions.length === 0) {
        return undefined;
      }
      if (orConditions.length === 1) {
        return orConditions[0];
      }
      return or(...orConditions);
    }
  }
}

function parseStates(statesStr: string): number[] {
  if (!statesStr) {
    return [];
  }
  const parsed = statesStr.split(",").map(Number);
  // oxlint-disable-next-line typescript-eslint(no-unsafe-return),typescript-eslint(no-unsafe-call),eslint-plugin-unicorn(no-array-sort) -- toSorted triggers false positive; sort on spread copy is safe
  return [...parsed].sort((a, b) => a - b);
}

function buildWhereClause(node: SearchNode, userId: string): SQL {
  const userCondition = eq(notes.userId, userId);

  if (node.type === "text" && node.value === "") {
    return userCondition;
  }

  const filterCondition = nodeToCondition(node);
  if (!filterCondition) {
    return userCondition;
  }

  return and(userCondition, filterCondition)!;
}

export class BrowseService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  search(
    userId: string,
    query: string,
    options?: SearchOptions,
  ): BrowseSearchResult {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const offset = (page - 1) * limit;

    const ast = parseSearchQuery(query);
    const conditions = buildWhereClause(ast, userId);

    // Query 1: Get distinct note IDs matching all conditions, with pagination
    const countResult = this.db
      .selectDistinct({ noteId: notes.id })
      .from(notes)
      .innerJoin(cards, eq(cards.noteId, notes.id))
      .innerJoin(decks, eq(cards.deckId, decks.id))
      .where(conditions)
      .all();

    const total = countResult.length;

    const noteIdRows = this.db
      .selectDistinct({ noteId: notes.id })
      .from(notes)
      .innerJoin(cards, eq(cards.noteId, notes.id))
      .innerJoin(decks, eq(cards.deckId, decks.id))
      .where(conditions)
      .limit(limit)
      .offset(offset)
      .all();

    const noteIds = noteIdRows.map((r) => r.noteId);

    if (noteIds.length === 0) {
      return { notes: [], total, page, limit };
    }

    // Query 2: For the returned note IDs, fetch note data with card aggregation
    const noteRows = this.db
      .select({
        noteId: notes.id,
        noteTypeId: notes.noteTypeId,
        noteTypeName: noteTypes.name,
        fields: notes.fields,
        tags: notes.tags,
        deckName: decks.name,
        deckId: decks.id,
        cardCount: sql<number>`count(${cards.id})`,
        earliestDue: sql<string>`min(${cards.due})`,
        states: sql<string>`group_concat(distinct ${cards.state})`,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .innerJoin(cards, eq(cards.noteId, notes.id))
      .innerJoin(decks, eq(cards.deckId, decks.id))
      .innerJoin(noteTypes, eq(noteTypes.id, notes.noteTypeId))
      .where(inArray(notes.id, noteIds))
      .groupBy(notes.id)
      .all();

    const browseNotes: BrowseNote[] = noteRows.map((row) => ({
      noteId: row.noteId,
      noteTypeId: row.noteTypeId,
      noteTypeName: row.noteTypeName,
      fields: row.fields,
      tags: row.tags ?? "",
      deckName: row.deckName,
      deckId: row.deckId,
      cardCount: Number(row.cardCount),
      earliestDue: row.earliestDue || undefined,
      states: parseStates(row.states),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    }));

    return {
      notes: browseNotes,
      total,
      page,
      limit,
    };
  }

  getCardDetail(userId: string, cardId: string): CardDetail | undefined {
    // Get card with note and deck
    const row = this.db
      .select({
        card: cards,
        note: notes,
        deckName: decks.name,
      })
      .from(cards)
      .innerJoin(notes, eq(cards.noteId, notes.id))
      .innerJoin(decks, eq(cards.deckId, decks.id))
      .where(and(eq(cards.id, cardId), eq(notes.userId, userId)))
      .get();

    if (!row) {
      return undefined;
    }

    // Get note type
    const noteType = this.db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.id, row.note.noteTypeId))
      .get();

    if (!noteType) {
      return undefined;
    }

    // Get templates for this note type
    const templates = this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, noteType.id))
      .all();

    // Get recent review logs (last 10)
    const recentReviews = this.db
      .select()
      .from(reviewLogs)
      .where(eq(reviewLogs.cardId, cardId))
      .orderBy(sql`${reviewLogs.reviewedAt} desc`)
      .limit(10)
      .all();

    return {
      card: row.card,
      note: row.note,
      noteType,
      templates,
      recentReviews,
      deckName: row.deckName,
    };
  }
}
