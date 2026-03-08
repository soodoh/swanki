import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth";
import { UserSettingsService } from "./services/user-settings-service";
import { db } from "../db";

const settingsService = new UserSettingsService(db);

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({
      headers: headers,
    });
    return session;
  },
);

export const getUserTheme = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({
      headers: headers,
    });
    if (!session) {
      return "system";
    }
    return settingsService.getTheme(session.user.id);
  },
);
