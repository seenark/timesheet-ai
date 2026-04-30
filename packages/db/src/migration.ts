import {
  logDebug,
  logError,
  logInfo,
  logWarn,
} from "@timesheet-ai/observability";
import { Effect } from "effect";
import { SurrealDbTag } from "./connection";
import { INDEX_DEFINITIONS } from "./schema/indexes";
import { TABLE_DEFINITIONS } from "./schema/tables";

export const runMigrations = Effect.gen(function* () {
  const db = yield* SurrealDbTag;

  yield* logInfo("Running schema migrations...", {
    tables: TABLE_DEFINITIONS.length,
    indexes: INDEX_DEFINITIONS.length,
  });

  yield* Effect.forEach(TABLE_DEFINITIONS, (stmt) =>
    Effect.gen(function* () {
      yield* db.query(stmt);
      yield* logDebug("Schema applied", {
        statement: stmt.slice(0, 60),
      });
    }).pipe(
      Effect.catchAll((e) =>
        Effect.gen(function* () {
          yield* logError("Schema failed", {
            statement: stmt.slice(0, 60),
            error: String(e),
          });
          return yield* Effect.fail(e);
        })
      )
    )
  );

  yield* Effect.forEach(INDEX_DEFINITIONS, (stmt) =>
    db.query(stmt).pipe(
      Effect.catchAll((e) =>
        logWarn("Index skipped", {
          statement: stmt.slice(0, 60),
          error: String(e),
        })
      )
    )
  );

  yield* logInfo("Schema migrations complete");
});
