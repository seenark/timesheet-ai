import { createLogger } from "@timesheet-ai/observability";
import type { Surreal } from "surrealdb";

const log = createLogger({ module: "job:health-check" });

export const runHealthCheck = async (db: Surreal): Promise<void> => {
  const result = await db.query(
    "SELECT count() AS total FROM job_run GROUP BY total"
  );
  log.info("Health check passed", { queryResult: result });
};
