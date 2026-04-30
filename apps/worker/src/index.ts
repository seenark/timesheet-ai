import { getDb, runMigrations } from "@timesheet-ai/db";
import { createLogger } from "@timesheet-ai/observability";
import { pollAndExecute, registerJobHandler } from "./job-runner";
import { runHealthCheck } from "./jobs/health-check";
import { ok } from "@timesheet-ai/shared";

const log = createLogger({ app: "worker" });

const POLL_INTERVAL_MS = 5_000;

const main = async () => {
  log.info("Worker starting...");

  const db = await getDb();
  await runMigrations(db);

  registerJobHandler("health-check", async (db) => {
    await runHealthCheck(db);
    return ok(undefined);
  });

  log.info("Worker ready, polling for jobs", { intervalMs: POLL_INTERVAL_MS });

  const poll = async () => {
    try {
      const count = await pollAndExecute(db);
      if (count > 0) {
        log.info("Poll cycle complete", { executed: count });
      }
    } catch (err) {
      log.error("Poll cycle error", { error: String(err) });
    }
  };

  setInterval(poll, POLL_INTERVAL_MS);
  await poll();
};

main().catch((err) => {
  log.error("Worker fatal error", { error: String(err) });
  process.exit(1);
});