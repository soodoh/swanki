/**
 * Local query functions using Drizzle ORM for the offline SQL.js database.
 * These mirror the server service return types so hooks can transparently
 * switch between server and local data.
 */
import { eq, and, lte, gt, inArray, gte, sql, desc } from "drizzle-orm";
import type { LocalDrizzleDb } from "./local-drizzle";
import {
  decks,
  noteTypes,
  cardTemplates,
  notes,
  cards,
  reviewLogs,
} from "../../db/schema";
import { previewAll } from "../fsrs";

// -- Helpers --

function toISO(d: Date | null | undefined): string | undefined {
  if (!d) {
    return undefined;
  }
  return d.toISOString();
}

function toISORequired(d: Date): string {
  return d.toISOString();
}

// -- Types matching hook return types --

export type DeckTreeNode = {
  id: number;
  userId: string;
  name: string;
  parentId: number | undefined;
  description: string;
  settings: { newCardsPerDay: number; maxReviewsPerDay: number } | undefined;
  createdAt: string;
  updatedAt: string;
  children: DeckTreeNode[];
};

type CardWithNote = {
  id: number;
  noteId: number;
  deckId: number;
  templateId: number;
  ordinal: number;
  due: string;
  stability: number | undefined;
  difficulty: number | undefined;
  elapsedDays: number | undefined;
  scheduledDays: number | undefined;
  reps: number | undefined;
  lapses: number | undefined;
  state: number | undefined;
  lastReview: string | undefined;
  createdAt: string;
  updatedAt: string;
  noteFields: Record<string, string>;
};

type CardCounts = {
  new: number;
  learning: number;
  review: number;
};

type StudyCardTemplate = {
  id: number;
  questionTemplate: string;
  answerTemplate: string;
};

type StudySession = {
  cards: CardWithNote[];
  counts: CardCounts;
  templates: Record<number, StudyCardTemplate>;
  css: Record<number, string>;
};

// -- Tree building --

function buildTree(flatDecks: DeckTreeNode[]): DeckTreeNode[] {
  const nodeMap = new Map<number, DeckTreeNode>();
  for (const d of flatDecks) {
    nodeMap.set(d.id, { ...d, children: [] });
  }
  const roots: DeckTreeNode[] = [];
  for (const d of flatDecks) {
    const node = nodeMap.get(d.id)!;
    if (d.parentId && nodeMap.has(d.parentId)) {
      nodeMap.get(d.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return sortTree(roots);
}

function sortTree(nodes: DeckTreeNode[]): DeckTreeNode[] {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    sortTree(node.children);
  }
  return nodes;
}

// -- Query Functions --

export function getDecksTree(db: LocalDrizzleDb): DeckTreeNode[] {
  const rows = db.select().from(decks).all();
  const flatDecks: DeckTreeNode[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    parentId: r.parentId ?? undefined,
    description: r.description ?? "",
    settings: r.settings ?? undefined,
    createdAt: toISORequired(r.createdAt),
    updatedAt: toISORequired(r.updatedAt),
    children: [],
  }));
  return buildTree(flatDecks);
}

function getDescendantDeckIds(db: LocalDrizzleDb, parentId: number): number[] {
  const children = db
    .select({ id: decks.id })
    .from(decks)
    .where(eq(decks.parentId, parentId))
    .all();
  const result: number[] = [];
  for (const child of children) {
    result.push(child.id);
    result.push(...getDescendantDeckIds(db, child.id));
  }
  return result;
}

function mapCardRow(
  card: typeof cards.$inferSelect,
  noteFields: Record<string, string>,
): CardWithNote {
  return {
    id: card.id,
    noteId: card.noteId,
    deckId: card.deckId,
    templateId: card.templateId,
    ordinal: card.ordinal,
    due: toISORequired(card.due),
    stability: card.stability ?? undefined,
    difficulty: card.difficulty ?? undefined,
    elapsedDays: card.elapsedDays ?? undefined,
    scheduledDays: card.scheduledDays ?? undefined,
    reps: card.reps ?? undefined,
    lapses: card.lapses ?? undefined,
    state: card.state ?? undefined,
    lastReview: toISO(card.lastReview),
    createdAt: toISORequired(card.createdAt),
    updatedAt: toISORequired(card.updatedAt),
    noteFields,
  };
}

function getTodayReviewData(db: LocalDrizzleDb, deckIds: number[]) {
  if (deckIds.length === 0) {
    return {
      newStudied: 0,
      reviewStudied: 0,
      reviewedNoteIds: new Set<number>(),
      reviewedCardIds: new Set<number>(),
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = db
    .select({
      cardId: reviewLogs.cardId,
      preReviewState: reviewLogs.state,
      noteId: cards.noteId,
    })
    .from(reviewLogs)
    .innerJoin(cards, eq(reviewLogs.cardId, cards.id))
    .where(
      and(
        inArray(cards.deckId, deckIds),
        gte(reviewLogs.reviewedAt, todayStart),
      ),
    )
    .all();

  const newCardIds = new Set<number>();
  const reviewCardIds = new Set<number>();
  const reviewedNoteIds = new Set<number>();
  const reviewedCardIds = new Set<number>();

  for (const row of rows) {
    reviewedCardIds.add(row.cardId);
    reviewedNoteIds.add(row.noteId);
    if (row.preReviewState === 0) {
      newCardIds.add(row.cardId);
    } else if (row.preReviewState === 2) {
      reviewCardIds.add(row.cardId);
    }
  }

  return {
    newStudied: newCardIds.size,
    reviewStudied: reviewCardIds.size,
    reviewedNoteIds,
    reviewedCardIds,
  };
}

function deriveCounts(allCards: CardWithNote[]): CardCounts {
  const counts: CardCounts = { new: 0, learning: 0, review: 0 };
  for (const card of allCards) {
    const state = card.state ?? 0;
    if (state === 0) {
      counts.new += 1;
    } else if (state === 1 || state === 3) {
      counts.learning += 1;
    } else if (state === 2) {
      counts.review += 1;
    }
  }
  return counts;
}

function fetchTemplatesForCards(
  db: LocalDrizzleDb,
  allCards: CardWithNote[],
): Record<number, StudyCardTemplate> {
  const templateIds = [...new Set(allCards.map((c) => c.templateId))];
  const templates: Record<number, StudyCardTemplate> = {};
  if (templateIds.length > 0) {
    const tmplRows = db
      .select()
      .from(cardTemplates)
      .where(inArray(cardTemplates.id, templateIds))
      .all();
    for (const t of tmplRows) {
      templates[t.id] = {
        id: t.id,
        questionTemplate: t.questionTemplate,
        answerTemplate: t.answerTemplate,
      };
    }
  }
  return templates;
}

function fetchCssForCards(
  db: LocalDrizzleDb,
  allCards: CardWithNote[],
): Record<number, string> {
  const noteIds = [...new Set(allCards.map((c) => c.noteId))];
  const cssMap: Record<number, string> = {};
  if (noteIds.length === 0) {
    return cssMap;
  }

  const noteRows = db
    .select({ noteTypeId: notes.noteTypeId })
    .from(notes)
    .where(inArray(notes.id, noteIds))
    .all();
  const noteTypeIds = [...new Set(noteRows.map((n) => n.noteTypeId))];
  if (noteTypeIds.length > 0) {
    const ntRows = db
      .select({ id: noteTypes.id, css: noteTypes.css })
      .from(noteTypes)
      .where(inArray(noteTypes.id, noteTypeIds))
      .all();
    for (const nt of ntRows) {
      cssMap[nt.id] = nt.css ?? "";
    }
  }
  return cssMap;
}

export function getStudySession(
  db: LocalDrizzleDb,
  deckId: number,
): StudySession {
  const now = new Date();
  const deckIds = [deckId, ...getDescendantDeckIds(db, deckId)];

  // Get deck settings
  const deck = db.select().from(decks).where(eq(decks.id, deckId)).get();
  const settings = deck?.settings ?? {
    newCardsPerDay: 20,
    maxReviewsPerDay: 200,
  };

  // Today's review data for limits and sibling burying
  const todayData = getTodayReviewData(db, deckIds);
  const remainingNewLimit = Math.max(
    0,
    settings.newCardsPerDay - todayData.newStudied,
  );
  const remainingReviewLimit = Math.max(
    0,
    settings.maxReviewsPerDay - todayData.reviewStudied,
  );

  // Due cards with note fields
  const dueRows = db
    .select({ card: cards, noteFields: notes.fields })
    .from(cards)
    .innerJoin(notes, eq(cards.noteId, notes.id))
    .where(and(inArray(cards.deckId, deckIds), lte(cards.due, now)))
    .all();

  // Sibling burying + categorize + sort + limit
  const allCards = categorizeAndLimit(
    dueRows,
    todayData,
    remainingNewLimit,
    remainingReviewLimit,
  );

  // Counts
  const counts = deriveCounts(allCards);

  // Pending learning count
  const pendingResult = db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(
      and(
        inArray(cards.deckId, deckIds),
        inArray(cards.state, [1, 3]),
        gt(cards.due, now),
      ),
    )
    .get();
  counts.learning += Number(pendingResult?.count ?? 0);

  return {
    cards: allCards,
    counts,
    templates: fetchTemplatesForCards(db, allCards),
    css: fetchCssForCards(db, allCards),
  };
}

type DueRow = {
  card: typeof cards.$inferSelect;
  noteFields: Record<string, string>;
};

function categorizeAndLimit(
  dueRows: DueRow[],
  todayData: ReturnType<typeof getTodayReviewData>,
  remainingNewLimit: number,
  remainingReviewLimit: number,
): CardWithNote[] {
  // Sibling burying
  const filtered = dueRows.filter((row) => {
    if (todayData.reviewedNoteIds.has(row.card.noteId)) {
      return todayData.reviewedCardIds.has(row.card.id);
    }
    return true;
  });

  const learningCards: CardWithNote[] = [];
  const reviewCards: CardWithNote[] = [];
  const newCards: CardWithNote[] = [];

  for (const row of filtered) {
    const card = mapCardRow(row.card, row.noteFields);
    const state = row.card.state ?? 0;
    if (state === 2) {
      reviewCards.push(card);
    } else if (state === 1 || state === 3) {
      learningCards.push(card);
    } else {
      newCards.push(card);
    }
  }

  // Sort
  learningCards.sort(
    (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
  );
  for (let i = reviewCards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [reviewCards[i], reviewCards[j]] = [reviewCards[j], reviewCards[i]];
  }
  newCards.sort((a, b) => a.ordinal - b.ordinal);

  return [
    ...learningCards,
    ...reviewCards.slice(0, remainingReviewLimit),
    ...newCards.slice(0, remainingNewLimit),
  ];
}

export function getDeckCounts(db: LocalDrizzleDb, deckId: number): CardCounts {
  const session = getStudySession(db, deckId);
  return session.counts;
}

type IntervalPreview = {
  rating: number;
  due: string;
  stability: number;
  difficulty: number;
  state: number;
  scheduledDays: number;
};

export function getIntervalPreviews(
  db: LocalDrizzleDb,
  cardId: number,
): Record<number, IntervalPreview> | undefined {
  const row = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!row) {
    return undefined;
  }

  const dbCard = {
    due: row.due,
    stability: row.stability ?? undefined,
    difficulty: row.difficulty ?? undefined,
    elapsedDays: row.elapsedDays ?? undefined,
    scheduledDays: row.scheduledDays ?? undefined,
    reps: row.reps ?? undefined,
    lapses: row.lapses ?? undefined,
    state: row.state ?? undefined,
    lastReview: row.lastReview ?? undefined,
  };

  const previews = previewAll(dbCard);
  const result: Record<number, IntervalPreview> = {};
  for (const [key, val] of Object.entries(previews)) {
    result[Number(key)] = {
      rating: val.rating,
      due: val.due.toISOString(),
      stability: val.stability,
      difficulty: val.difficulty,
      state: val.state,
      scheduledDays: val.scheduledDays,
    };
  }
  return result;
}

// -- Stats queries --

type ReviewsPerDay = { date: string; count: number };

export function getReviewsPerDay(
  db: LocalDrizzleDb,
  days: number,
): ReviewsPerDay[] {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

  const rows = db
    .select({
      date: sql<string>`date(reviewed_at, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(reviewLogs)
    .where(gte(reviewLogs.reviewedAt, startDate))
    .groupBy(sql`date(reviewed_at, 'unixepoch')`)
    .all();

  const countMap = new Map<string, number>();
  for (const row of rows) {
    countMap.set(row.date, Number(row.count));
  }

  const result: ReviewsPerDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    result.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
  }
  return result;
}

type CardStates = {
  new: number;
  learning: number;
  review: number;
  relearning: number;
};

export function getCardStates(db: LocalDrizzleDb): CardStates {
  const rows = db
    .select({
      state: cards.state,
      count: sql<number>`count(*)`,
    })
    .from(cards)
    .groupBy(cards.state)
    .all();

  const states: CardStates = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const row of rows) {
    const state = row.state ?? 0;
    if (state === 0) {
      states.new = Number(row.count);
    } else if (state === 1) {
      states.learning = Number(row.count);
    } else if (state === 2) {
      states.review = Number(row.count);
    } else if (state === 3) {
      states.relearning = Number(row.count);
    }
  }
  return states;
}

type Streak = { current: number; longest: number };

export function getStreak(db: LocalDrizzleDb): Streak {
  const rows = db
    .select({ date: sql<string>`date(reviewed_at, 'unixepoch')` })
    .from(reviewLogs)
    .groupBy(sql`date(reviewed_at, 'unixepoch')`)
    .orderBy(desc(sql`date(reviewed_at, 'unixepoch')`))
    .all();

  if (rows.length === 0) {
    return { current: 0, longest: 0 };
  }

  const reviewDates = new Set(rows.map((r) => r.date));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  let current = 0;
  if (reviewDates.has(todayStr)) {
    current = 1;
    const d = new Date(today);
    while (true) {
      d.setUTCDate(d.getUTCDate() - 1);
      const ds = d.toISOString().split("T")[0];
      if (reviewDates.has(ds)) {
        current += 1;
      } else {
        break;
      }
    }
  }

  const sortedDates = [...reviewDates].toSorted();
  let longest = 0;
  let streak = 0;
  for (let i = 0; i < sortedDates.length; i += 1) {
    if (i === 0) {
      streak = 1;
    } else {
      const prev = new Date(`${sortedDates[i - 1]}T00:00:00Z`);
      const curr = new Date(`${sortedDates[i]}T00:00:00Z`);
      const diffDays =
        (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);
      streak = diffDays === 1 ? streak + 1 : 1;
    }
    if (streak > longest) {
      longest = streak;
    }
  }

  return { current, longest };
}

type Heatmap = Record<string, number>;

export function getHeatmap(db: LocalDrizzleDb, year: number): Heatmap {
  const startDate = new Date(`${year}-01-01T00:00:00Z`);
  const endDate = new Date(`${year + 1}-01-01T00:00:00Z`);

  const rows = db
    .select({
      date: sql<string>`date(reviewed_at, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(reviewLogs)
    .where(gte(reviewLogs.reviewedAt, startDate))
    .groupBy(sql`date(reviewed_at, 'unixepoch')`)
    .all();

  const heatmap: Heatmap = {};
  for (const row of rows) {
    if (new Date(`${row.date}T00:00:00Z`) < endDate) {
      heatmap[row.date] = Number(row.count);
    }
  }
  return heatmap;
}

// -- Note type queries --

type NoteTypeField = { name: string; ordinal: number };
type NoteTypeHook = {
  id: number;
  userId: string;
  name: string;
  fields: NoteTypeField[];
  css: string;
  createdAt: string;
  updatedAt: string;
};
type CardTemplateHook = {
  id: number;
  noteTypeId: number;
  name: string;
  ordinal: number;
  questionTemplate: string;
  answerTemplate: string;
};
type NoteTypeWithTemplates = {
  noteType: NoteTypeHook;
  templates: CardTemplateHook[];
};

export function getNoteTypes(db: LocalDrizzleDb): NoteTypeWithTemplates[] {
  const ntRows = db.select().from(noteTypes).all();

  return ntRows.map((nt) => {
    const ctRows = db
      .select()
      .from(cardTemplates)
      .where(eq(cardTemplates.noteTypeId, nt.id))
      .all();

    return {
      noteType: {
        id: nt.id,
        userId: nt.userId,
        name: nt.name,
        fields: nt.fields as NoteTypeField[],
        css: nt.css ?? "",
        createdAt: toISORequired(nt.createdAt),
        updatedAt: toISORequired(nt.updatedAt),
      },
      templates: ctRows.map((ct) => ({
        id: ct.id,
        noteTypeId: ct.noteTypeId,
        name: ct.name,
        ordinal: ct.ordinal,
        questionTemplate: ct.questionTemplate,
        answerTemplate: ct.answerTemplate,
      })),
    };
  });
}

export function getNoteType(
  db: LocalDrizzleDb,
  id: number,
): NoteTypeWithTemplates | undefined {
  const all = getNoteTypes(db);
  return all.find((nt) => nt.noteType.id === id);
}

export function getFirstNoteFields(
  db: LocalDrizzleDb,
  noteTypeId: number,
): Record<string, string> | undefined {
  const row = db
    .select({ fields: notes.fields })
    .from(notes)
    .where(eq(notes.noteTypeId, noteTypeId))
    .limit(1)
    .get();
  return row?.fields;
}

// -- Browse queries --

type BrowseNote = {
  noteId: number;
  noteTypeId: number;
  noteTypeName: string;
  fields: Record<string, string>;
  tags: string;
  deckName: string;
  deckId: number;
  cardCount: number;
  earliestDue: string | undefined;
  states: number[];
  createdAt: string;
  updatedAt: string;
};

type BrowseSearchResult = {
  notes: BrowseNote[];
  total: number;
  page: number;
  limit: number;
};

export function browseSearch(
  db: LocalDrizzleDb,
  query: string,
  page: number,
  pageLimit: number,
): BrowseSearchResult {
  const offset = (page - 1) * pageLimit;

  // Get all notes, optionally filtered by query text
  let allNotes = db.select().from(notes).all();
  if (query && query.trim()) {
    const q = query.toLowerCase();
    allNotes = allNotes.filter((n) =>
      JSON.stringify(n.fields).toLowerCase().includes(q),
    );
  }

  const total = allNotes.length;
  const pageNotes = allNotes.slice(offset, offset + pageLimit);

  if (pageNotes.length === 0) {
    return { notes: [], total, page, limit: pageLimit };
  }

  const browseNotes: BrowseNote[] = pageNotes.map((note) => {
    const noteCards = db
      .select()
      .from(cards)
      .where(eq(cards.noteId, note.id))
      .all();

    const nt = db
      .select({ name: noteTypes.name })
      .from(noteTypes)
      .where(eq(noteTypes.id, note.noteTypeId))
      .get();

    let deckName = "";
    let noteDeckId = 0;
    if (noteCards.length > 0) {
      const d = db
        .select({ id: decks.id, name: decks.name })
        .from(decks)
        .where(eq(decks.id, noteCards[0].deckId))
        .get();
      if (d) {
        deckName = d.name;
        noteDeckId = d.id;
      }
    }

    let earliestDue: Date | undefined;
    if (noteCards.length > 0) {
      let minCard = noteCards[0];
      for (const c of noteCards) {
        if (c.due < minCard.due) {
          minCard = c;
        }
      }
      earliestDue = minCard.due;
    }

    const cardStates = [
      ...new Set(noteCards.map((c) => c.state ?? 0)),
    ].toSorted((a, b) => a - b);

    return {
      noteId: note.id,
      noteTypeId: note.noteTypeId,
      noteTypeName: nt?.name ?? "",
      fields: note.fields,
      tags: note.tags ?? "",
      deckName,
      deckId: noteDeckId,
      cardCount: noteCards.length,
      earliestDue: earliestDue ? toISORequired(earliestDue) : undefined,
      states: cardStates,
      createdAt: toISORequired(note.createdAt),
      updatedAt: toISORequired(note.updatedAt),
    };
  });

  return { notes: browseNotes, total, page, limit: pageLimit };
}

type NoteDetail = {
  note: {
    id: number;
    userId: string;
    noteTypeId: number;
    fields: Record<string, string>;
    tags: string | undefined;
    createdAt: string;
    updatedAt: string;
  };
  noteType: {
    id: number;
    name: string;
    fields: string;
    css: string;
  };
  templates: Array<{
    id: number;
    name: string;
    questionTemplate: string;
    answerTemplate: string;
  }>;
  deckName: string;
  deckId: number;
};

export function getNoteDetail(
  db: LocalDrizzleDb,
  noteId: number,
): NoteDetail | undefined {
  const note = db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) {
    return undefined;
  }

  const nt = db
    .select()
    .from(noteTypes)
    .where(eq(noteTypes.id, note.noteTypeId))
    .get();
  if (!nt) {
    return undefined;
  }

  const tmpls = db
    .select()
    .from(cardTemplates)
    .where(eq(cardTemplates.noteTypeId, nt.id))
    .all();

  const firstCard = db
    .select({ deckId: cards.deckId })
    .from(cards)
    .where(eq(cards.noteId, noteId))
    .limit(1)
    .get();

  let deckName = "";
  let detailDeckId = 0;
  if (firstCard) {
    const d = db
      .select({ id: decks.id, name: decks.name })
      .from(decks)
      .where(eq(decks.id, firstCard.deckId))
      .get();
    if (d) {
      deckName = d.name;
      detailDeckId = d.id;
    }
  }

  return {
    note: {
      id: note.id,
      userId: note.userId,
      noteTypeId: note.noteTypeId,
      fields: note.fields,
      tags: note.tags ?? undefined,
      createdAt: toISORequired(note.createdAt),
      updatedAt: toISORequired(note.updatedAt),
    },
    noteType: {
      id: nt.id,
      name: nt.name,
      fields: JSON.stringify(nt.fields),
      css: nt.css ?? "",
    },
    templates: tmpls.map((t) => ({
      id: t.id,
      name: t.name,
      questionTemplate: t.questionTemplate,
      answerTemplate: t.answerTemplate,
    })),
    deckName,
    deckId: detailDeckId,
  };
}
