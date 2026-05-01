import { SurrealDb } from "@timesheet-ai/db";
import { registerPlugin } from "@timesheet-ai/ingestion-core";
import { DiscordIngestionPlugin } from "@timesheet-ai/ingestion-discord";
import { GitIngestionPlugin } from "@timesheet-ai/ingestion-git";
import { PlaneIngestionPlugin } from "@timesheet-ai/ingestion-plane";
import { logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { pollAndExecute, registerJobHandler } from "./job-runner";
import { runDailySummaryGeneration } from "./jobs/daily-summary-generation";
import { runEventEnrichment } from "./jobs/event-enrichment";
import { runHealthCheck } from "./jobs/health-check";
import { runIdentityResolve } from "./jobs/identity-resolve";
import { runIngestionSync } from "./jobs/ingestion-sync";
import { runSessionDetection } from "./jobs/session-detection";
import { runWorkUnitGeneration } from "./jobs/work-unit-generation";

const POLL_INTERVAL_MS = 5000;

let isShuttingDown = false;

process.on("SIGINT", () => {
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
});

registerPlugin(GitIngestionPlugin);
registerPlugin(PlaneIngestionPlugin);
registerPlugin(DiscordIngestionPlugin);

registerJobHandler("daily-summary-generation", runDailySummaryGeneration);
registerJobHandler("event-enrichment", runEventEnrichment);
registerJobHandler("health-check", runHealthCheck);
registerJobHandler("identity-resolve", runIdentityResolve);
registerJobHandler("ingestion-sync", runIngestionSync);
registerJobHandler("session-detection", runSessionDetection);
registerJobHandler("work-unit-generation", runWorkUnitGeneration);

const program = Effect.gen(function* () {
  yield* logInfo("Worker starting...");

  yield* Effect.forkDaemon(
    Effect.gen(function* () {
      while (!isShuttingDown) {
        const count = yield* pollAndExecute();
        if (count > 0) {
          yield* logInfo("Poll cycle complete", { executed: count });
        }
        yield* Effect.sleep(POLL_INTERVAL_MS);
      }
      yield* logInfo("Worker shutting down...");
    })
  );

  yield* logInfo("Worker ready", {
    intervalMs: POLL_INTERVAL_MS,
    plugins: ["git", "plane", "discord"],
  });
});

Effect.runFork(program.pipe(Effect.provide(SurrealDb)));

console.log(`Worker polling every ${POLL_INTERVAL_MS}ms`);
