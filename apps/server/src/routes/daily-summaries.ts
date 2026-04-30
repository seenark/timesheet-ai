import {
  getDailySummary,
  listSummariesByOrg,
  listSummariesByScope,
  SurrealDb,
} from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const dailySummaryRoutes = new Elysia({ prefix: "/daily-summaries" })
  .get(
    "/",
    async ({ query }) => {
      const dateStart = query.dateStart ?? query.date ?? "";
      const dateEnd = query.dateEnd ?? query.date ?? "";

      const effect = Effect.gen(function* () {
        if (query.scopeType && query.scopeId) {
          return yield* listSummariesByScope(
            query.scopeType,
            query.scopeId,
            dateStart,
            dateEnd
          );
        }
        return yield* listSummariesByOrg(query.orgId);
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
        orgId: t.String(),
        scopeType: t.Optional(
          t.Union([t.Literal("user"), t.Literal("project")])
        ),
        scopeId: t.Optional(t.String()),
        date: t.Optional(t.String()),
        dateStart: t.Optional(t.String()),
        dateEnd: t.Optional(t.String()),
      }),
    }
  )
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getDailySummary(params.id);
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "NOT_FOUND",
          message: String(error),
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  });
