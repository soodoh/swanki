/**
 * Drizzle ORM wrapper for the local SQL.js database.
 * Uses the same schema as the server, giving us fully typed queries.
 */
import { drizzle } from "drizzle-orm/sql-js";
import type { SQLJsDatabase } from "drizzle-orm/sql-js";
import type { SqlJsDatabase } from "./sql-js-init";
import {
  decks,
  noteTypes,
  cardTemplates,
  notes,
  cards,
  reviewLogs,
  media,
  noteMedia,
} from "../../db/schema";

/** Client-side schema — data tables only, no auth tables. */
const clientSchema = {
  decks,
  noteTypes,
  cardTemplates,
  notes,
  cards,
  reviewLogs,
  media,
  noteMedia,
};

type ClientSchema = typeof clientSchema;

/** Typed Drizzle database for the local SQL.js instance. */
export type LocalDrizzleDb = SQLJsDatabase<ClientSchema>;

/** Wrap a raw SQL.js Database with Drizzle for typed queries. */
export function createLocalDrizzle(rawDb: SqlJsDatabase): LocalDrizzleDb {
  return drizzle(rawDb, { schema: clientSchema });
}
