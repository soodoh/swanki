import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../lib/auth-middleware";
import { BrowseService } from "../../lib/services/browse-service";
import { NoteService } from "../../lib/services/note-service";
import { CardService } from "../../lib/services/card-service";
import { MediaService } from "../../lib/services/media-service";
import { extractMediaFilenames } from "../../lib/services/import-service";
import { db } from "../../db";
import type { SearchOptions } from "../../lib/services/browse-service";

const browseService = new BrowseService(db);
const noteService = new NoteService(db);
const cardService = new CardService(db);

export const Route = createFileRoute("/api/browse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const url = new URL(request.url);

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

        // Check for card detail request
        const cardId = url.searchParams.get("cardId");
        if (cardId) {
          const detail = browseService.getCardDetail(session.user.id, cardId);
          if (!detail) {
            return Response.json({ error: "Card not found" }, { status: 404 });
          }
          return Response.json(detail);
        }

        const result = browseService.search(session.user.id, q, {
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
          cardId: string;
          fields?: Record<string, string>;
          deckId?: string;
        };

        const { cardId, fields, deckId } = body;
        if (!cardId) {
          return Response.json(
            { error: "cardId is required" },
            { status: 400 },
          );
        }

        // Get the card detail to find the noteId
        const detail = browseService.getCardDetail(session.user.id, cardId);
        if (!detail) {
          return Response.json({ error: "Card not found" }, { status: 404 });
        }

        // Update note fields
        if (fields) {
          noteService.update(detail.note.id, session.user.id, { fields });
          const mediaService = new MediaService(db);
          const filenames = extractMediaFilenames(fields);
          mediaService.reconcileNoteReferences(detail.note.id, filenames);
        }

        // Move card to different deck
        if (deckId && deckId !== detail.card.deckId) {
          cardService.moveToDeck([cardId], deckId, session.user.id);
        }

        return Response.json({ success: true });
      },
    },
  },
});
