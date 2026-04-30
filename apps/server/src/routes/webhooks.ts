import { createJobRun, SurrealDb } from "@timesheet-ai/db";
import { logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { Elysia } from "elysia";

export const webhookRoutes = new Elysia({
  prefix: "/webhooks",
}).post("/git", async ({ body, headers }) => {
  const payload = body as unknown;
  const githubEvent = headers["x-github-event"] as string | undefined;

  if (!githubEvent) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing x-github-event header" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const p = payload as Record<string, unknown>;
  const repo = p.repository as Record<string, unknown> | undefined;
  const repoName = repo?.full_name as string | undefined;

  await Effect.runPromise(
    logInfo("Git webhook received", { event: githubEvent, repo: repoName })
  );

  const supportedEvents = ["push", "pull_request"];
  if (!supportedEvents.includes(githubEvent)) {
    return { ok: true as const, message: `Event ${githubEvent} ignored` };
  }

  const effect = Effect.gen(function* () {
    const organizationId = "org_default";
    const job = yield* createJobRun({
      organizationId,
      jobType: "ingestion-sync",
      metadata: {
        connectionId: `git:${repoName ?? "unknown"}`,
        rawPayloads: [payload],
        source: "git",
        githubEvent,
      },
    });
    return job;
  }).pipe(Effect.provide(SurrealDb));

  try {
    const result = await Effect.runPromise(effect);
    return { ok: true as const, data: result };
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "INTERNAL_ERROR",
        message: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
