import { SurrealDb, SurrealDbTag } from "@timesheet-ai/db";
import { logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runHealthCheck = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = yield* db.query(
      "SELECT count() AS total FROM job_run GROUP BY total"
    );
    yield* logInfo("Health check passed", { queryResult: result });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      logInfo("Health check failed", { error: String(error) })
    )
  );
