import { Database } from "bun:sqlite";
import {
  parseApkg as coreParseApkg,
  type ParseApkgOptions,
  type TypedDatabase,
} from "@swanki/core/import/apkg-parser";

export type {
  ApkgNoteType,
  ApkgDeck,
  ApkgNote,
  ApkgCard,
  ApkgMediaEntry,
  ApkgData,
} from "@swanki/core/import/apkg-parser";

const createDb = (path: string): TypedDatabase =>
  new Database(path) as unknown as TypedDatabase;

export function parseApkg(
  buffer: ArrayBuffer,
  options?: Omit<ParseApkgOptions, "createDb">,
) {
  return coreParseApkg(buffer, { ...options, createDb });
}
