import { SurrealDb } from "@timesheet-ai/db";
import { registerPlugin } from "@timesheet-ai/ingestion-core";
import { GitIngestionPlugin } from "@timesheet-ai/ingestion-git";
import { logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { pollAndExecute, registerJobHandler } from "./job-runner";
import { runHealthCheck } from "./jobs/health-check";
import { runIngestionSync } from "./jobs/ingestion-sync";

const POLL_INTERVAL_MS = 5000;

let isShuttingDown = false;

process.on("SIGINT", () => {
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
});

registerPlugin(GitIngestionPlugin);

registerJobHandler("health-check", runHealthCheck);
registerJobHandler("ingestion-sync", runIngestionSync);

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
    plugins: ["git"],
  });
});

Effect.runFork(program.pipe(Effect.provide(SurrealDb)));

console.log(`Worker polling every ${POLL_INTERVAL_MS}ms`);
