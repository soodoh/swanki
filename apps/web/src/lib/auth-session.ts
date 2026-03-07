import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth";

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({
      headers: headers,
    });
    return session;
  },
);
