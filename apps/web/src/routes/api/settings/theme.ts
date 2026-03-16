import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { UserSettingsService } from "../../../lib/services/user-settings-service";
import { db } from "../../../db";

const settingsService = new UserSettingsService(db);

export const Route = createFileRoute("/api/settings/theme")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const theme = await settingsService.getTheme(session.user.id);
        return Response.json({ theme });
      },
      PUT: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as { theme?: string };
        const theme = body.theme;
        if (theme !== "light" && theme !== "dark" && theme !== "system") {
          return Response.json(
            { error: "Invalid theme. Must be 'light', 'dark', or 'system'" },
            { status: 400 },
          );
        }
        await settingsService.setTheme(session.user.id, theme);
        return Response.json({ theme });
      },
    },
  },
});
