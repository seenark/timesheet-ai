import { getEventsByUserAndDateRange, SurrealDb } from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const eventRoutes = new Elysia({
  prefix: "/events",
}).get(
  "/",
  async ({ query }) => {
    const effect = Effect.gen(function* () {
      const events = yield* getEventsByUserAndDateRange(
        query.userId,
        query.dateStart,
        query.dateEnd
      );
      return events;
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
  },
  {
    query: t.Object({
      userId: t.String(),
      dateStart: t.String(),
      dateEnd: t.String(),
    }),
  }
);
