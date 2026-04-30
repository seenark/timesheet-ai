import { SurrealDb, SurrealDbTag } from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia } from "elysia";
import { handleEffectError } from "../lib/effect";

export const healthRoutes = new Elysia({ prefix: "/health" })
  .get("/", () => ({
    ok: true as const,
    status: "healthy",
    timestamp: new Date().toISOString(),
  }))
  .get("/db", async () => {
    const effect = Effect.gen(function* () {
      const db = yield* SurrealDbTag;
      yield* db.query(
        "SELECT count() AS total FROM organization GROUP BY total LIMIT 1"
      );
      return { db: "connected" as const };
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return {
        ok: true as const,
        status: "healthy",
        ...result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return handleEffectError(error);
    }
  });
