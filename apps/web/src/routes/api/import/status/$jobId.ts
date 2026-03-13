import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../../lib/auth-middleware";
import { getJob } from "../../../../lib/import/import-job";

export const Route = createFileRoute("/api/import/status/$jobId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireSession(request);

        const job = getJob(params.jobId);
        if (!job) {
          return Response.json(
            { error: "Job not found or expired" },
            { status: 404 },
          );
        }

        return Response.json(job);
      },
    },
  },
});
