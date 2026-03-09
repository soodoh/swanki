import { eq, and, lte, like, sql, or, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";
import { cards, notes, decks, noteTypes, cardTemplates } from "../../db/schema";
import { parseSearchQuery } from "../search-parser";
import type { SearchNode } from "../search-parser";

type Db = BunSQLiteDatabase<typeof schema>;

type Note = typeof notes.$inferSelect;
type NoteType = typeof noteTypes.$inferSelect;
type CardTemplate = typeof cardTemplates.$inferSelect;
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

export type NoteDetail = {
  note: Note;
  noteType: NoteType;
  templates: CardTemplate[];
  deckName: string;
  deckId: string;
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

    // Query 1: Count distinct notes matching all conditions
    const countResult = this.db
      .select({ count: sql<number>`count(distinct ${notes.id})` })
      .from(notes)
      .innerJoin(cards, eq(cards.noteId, notes.id))
      .innerJoin(decks, eq(cards.deckId, decks.id))
      .where(conditions)
      .get();

    const total = countResult ? Number(countResult.count) : 0;

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
        deckName: sql<string>`min(${decks.name})`,
        deckId: sql<string>`min(${decks.id})`,
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

  getNoteDetail(userId: string, noteId: string): NoteDetail | undefined {
    const note = this.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
      .get();

    if (!note) {
      return undefined;
    }

    const noteType = this.db
      .select()
      .from(noteTypes)
      .where(eq(noteTypes.id, note.noteTypeId))
      .get();

    if (!noteType) {
      return undefined;
    }

    const templates = this.db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, noteType.id))
      .all();

    // Get deck from first card
    const firstCard = this.db
      .select({ deckId: cards.deckId })
      .from(cards)
      .where(eq(cards.noteId, noteId))
      .limit(1)
      .get();

    let deckName = "";
    let deckId = "";
    if (firstCard) {
      const deck = this.db
        .select()
        .from(decks)
        .where(eq(decks.id, firstCard.deckId))
        .get();
      if (deck) {
        deckName = deck.name;
        deckId = deck.id;
      }
    }

    return { note, noteType, templates, deckName, deckId };
  }
}
