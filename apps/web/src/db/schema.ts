export { user, session, account, verification } from "./auth-schema";

import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    description: text("description").default(""),
    settings: text("settings", { mode: "json" })
      .$type<{
        newCardsPerDay: number;
        maxReviewsPerDay: number;
      }>()
      .default({ newCardsPerDay: 20, maxReviewsPerDay: 200 }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("decks_user_id_idx").on(table.userId),
    index("decks_parent_id_idx").on(table.parentId),
  ],
);

export const noteTypes = sqliteTable(
  "note_types",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    fields: text("fields", { mode: "json" })
      .$type<Array<{ name: string; ordinal: number }>>()
      .notNull(),
    css: text("css").default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("note_types_user_id_idx").on(table.userId)],
);

export const cardTemplates = sqliteTable(
  "card_templates",
  {
    id: text("id").primaryKey(),
    noteTypeId: text("note_type_id").notNull(),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull(),
    questionTemplate: text("question_template").notNull(),
    answerTemplate: text("answer_template").notNull(),
  },
  (table) => [index("card_templates_note_type_id_idx").on(table.noteTypeId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    noteTypeId: text("note_type_id").notNull(),
    fields: text("fields", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),
    tags: text("tags").default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("notes_user_id_idx").on(table.userId),
    index("notes_note_type_id_idx").on(table.noteTypeId),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id").notNull(),
    deckId: text("deck_id").notNull(),
    templateId: text("template_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    due: integer("due", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    stability: real("stability").default(0),
    difficulty: real("difficulty").default(0),
    elapsedDays: integer("elapsed_days").default(0),
    scheduledDays: integer("scheduled_days").default(0),
    reps: integer("reps").default(0),
    lapses: integer("lapses").default(0),
    state: integer("state").default(0), // 0=new, 1=learning, 2=review, 3=relearning
    lastReview: integer("last_review", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("cards_note_id_idx").on(table.noteId),
    index("cards_deck_id_idx").on(table.deckId),
    index("cards_due_idx").on(table.due),
    index("cards_state_idx").on(table.state),
  ],
);

export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id").notNull(),
    rating: integer("rating").notNull(), // 1=again, 2=hard, 3=good, 4=easy
    state: integer("state").notNull(), // state before review
    due: integer("due", { mode: "timestamp" }).notNull(), // due before review
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    timeTakenMs: integer("time_taken_ms").notNull(),
  },
  (table) => [
    index("review_logs_card_id_idx").on(table.cardId),
    index("review_logs_reviewed_at_idx").on(table.reviewedAt),
  ],
);

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    filename: text("filename").notNull(),
    hash: text("hash").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("media_user_id_idx").on(table.userId),
    index("media_hash_idx").on(table.hash),
  ],
);
