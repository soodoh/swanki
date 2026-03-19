import { createFileRoute } from "@tanstack/react-router";
import { join } from "node:path";
import { requireSession } from "../../lib/auth-middleware";
import { BrowseService } from "../../lib/services/browse-service";
import { NoteService } from "../../lib/services/note-service";
import { CardService } from "../../lib/services/card-service";
import { MediaService } from "../../lib/services/media-service";
import { extractMediaFilenames } from "../../lib/services/import-service";
import { nodeFs } from "@swanki/core/node-filesystem";
import { db } from "../../db";
import type { SearchOptions } from "../../lib/services/browse-service";

const mediaDir: string = join(process.cwd(), "data", "media");

const browseService = new BrowseService(db);
const noteService = new NoteService(db);
const cardService = new CardService(db);

export const Route = createFileRoute("/api/browse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const url = new URL(request.url);

        // Check for note detail request
        const noteIdParam = url.searchParams.get("noteId");
        if (noteIdParam) {
          const noteId = Number(noteIdParam);
          if (Number.isNaN(noteId)) {
            return Response.json({ error: "Invalid noteId" }, { status: 400 });
          }
          const detail = await browseService.getNoteDetail(
            session.user.id,
            noteId,
          );
          if (!detail) {
            return Response.json({ error: "Note not found" }, { status: 404 });
          }
          return Response.json(detail);
        }

        const q = url.searchParams.get("q") ?? "";
        const page = Number(url.searchParams.get("page") ?? "1");
        const limit = Number(url.searchParams.get("limit") ?? "50");
        const sortBy =
          (url.searchParams.get("sortBy") as SearchOptions["sortBy"]) ??
          undefined;
        const sortDir =
          (url.searchParams.get("sortDir") as SearchOptions["sortDir"]) ??
          undefined;

        // Validate pagination params
        if (
          !Number.isFinite(page) ||
          page < 1 ||
          !Number.isFinite(limit) ||
          limit < 1 ||
          limit > 200
        ) {
          return Response.json(
            { error: "Invalid pagination parameters" },
            { status: 400 },
          );
        }

        const result = await browseService.search(session.user.id, q, {
          page,
          limit,
          sortBy,
          sortDir,
        });

        return Response.json(result);
      },
      PATCH: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as {
          noteId: number;
          fields?: Record<string, string>;
          deckId?: number;
          suspend?: boolean;
          bury?: boolean;
        };

        const { noteId, fields, deckId, suspend, bury } = body;
        if (!noteId) {
          return Response.json(
            { error: "noteId is required" },
            { status: 400 },
          );
        }

        // Verify ownership using NoteService.getById
        const noteData = await noteService.getById(noteId, session.user.id);
        if (!noteData) {
          return Response.json({ error: "Note not found" }, { status: 404 });
        }

        if (fields) {
          await noteService.update(noteId, session.user.id, { fields });
          const mediaService = new MediaService(db, mediaDir, nodeFs);
          const filenames = extractMediaFilenames(fields);
          await mediaService.reconcileNoteReferences(noteId, filenames);
        }

        if (deckId) {
          // Move ALL cards of this note to the new deck
          const cardIds = noteData.cards.map((c) => c.id);
          await cardService.moveToDeck(cardIds, deckId, session.user.id);
        }

        if (typeof suspend === "boolean") {
          const cardIds = noteData.cards.map((c) => c.id);
          await cardService.suspendCards(cardIds, session.user.id, suspend);
        }

        if (typeof bury === "boolean") {
          const cardIds = noteData.cards.map((c) => c.id);
          await (bury
            ? cardService.buryCards(cardIds, session.user.id)
            : cardService.unburyCards(cardIds, session.user.id));
        }

        return Response.json({ success: true });
      },
      DELETE: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as { noteId: number };
        if (!body.noteId) {
          return Response.json(
            { error: "noteId is required" },
            { status: 400 },
          );
        }
        await noteService.delete(body.noteId, session.user.id);
        return Response.json({ success: true });
      },
    },
  },
});
