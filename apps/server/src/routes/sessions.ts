import {
  getSession,
  listClustersBySession,
  listSessionsByOrg,
  listSessionsByUser,
  SurrealDb,
} from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const sessionRoutes = new Elysia({ prefix: "/sessions" })
  .get(
    "/",
    async ({ query }) => {
      const effect = Effect.gen(function* () {
        return yield* listSessionsByOrg(query.orgId);
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
      query: t.Object({ orgId: t.String() }),
    }
  )
  .get(
    "/user",
    async ({ query }) => {
      const effect = Effect.gen(function* () {
        return yield* listSessionsByUser(
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
  )
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getSession(params.id);
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
  .get("/:id/clusters", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* listClustersBySession(params.id);
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
  });