import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sync/ping")({
  server: {
    handlers: {
      GET: () => {
        return new Response(null, { status: 204 });
      },
      HEAD: () => {
        return new Response(null, { status: 204 });
      },
    },
  },
});
