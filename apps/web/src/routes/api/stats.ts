import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../lib/auth-middleware";
import { StatsService } from "../../lib/services/stats-service";
import { db } from "../../db";

const statsService = new StatsService(db);

export const Route = createFileRoute("/api/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const url = new URL(request.url);

        const type = url.searchParams.get("type");

        if (!type) {
          return Response.json(
            { error: "Missing required parameter: type" },
            { status: 400 },
          );
        }

        switch (type) {
          case "reviews": {
            const days = Number(url.searchParams.get("days") ?? "30");
            if (!Number.isFinite(days) || days < 1 || days > 365) {
              return Response.json(
                { error: "Invalid days parameter (1-365)" },
                { status: 400 },
              );
            }
            const reviews = await statsService.getReviewsPerDay(
              session.user.id,
              days,
            );
            return Response.json(reviews);
          }

          case "states": {
            const states = await statsService.getCardStates(session.user.id);
            return Response.json(states);
          }

          case "streak": {
            const streak = await statsService.getStreak(session.user.id);
            return Response.json(streak);
          }

          case "heatmap": {
            const year = Number(
              url.searchParams.get("year") ?? new Date().getFullYear(),
            );
            if (!Number.isFinite(year) || year < 2000 || year > 2100) {
              return Response.json(
                { error: "Invalid year parameter" },
                { status: 400 },
              );
            }
            const heatmap = await statsService.getHeatmap(
              session.user.id,
              year,
            );
            return Response.json(heatmap);
          }

          default:
            return Response.json(
              { error: "Invalid type parameter" },
              { status: 400 },
            );
        }
      },
    },
  },
});
