import { getCluster, listClustersByUser, SurrealDb } from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const clusterRoutes = new Elysia({ prefix: "/clusters" })
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getCluster(params.id);
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
  })
  .get(
    "/user",
    async ({ query }) => {
      const effect = Effect.gen(function* () {
        return yield* listClustersByUser(
          query.userId,
          query.dateStart,
          query.dateEnd
        );
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