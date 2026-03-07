import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../lib/auth-middleware";
import { BrowseService } from "../../lib/services/browse-service";
import { db } from "../../db";
import type { SearchOptions } from "../../lib/services/browse-service";

const browseService = new BrowseService(db);

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
    },
  },
});
