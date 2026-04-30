import {
  createSourceMapping,
  deleteSourceMapping,
  getMappingsByProject,
  getMappingsByScope,
  listMappingsByOrg,
  SurrealDb,
} from "@timesheet-ai/db";
import type { ExternalScopeType, MappingType, Source } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const mappingRoutes = new Elysia({ prefix: "/mappings" })
  .get(
    "/",
    async ({ query }) => {
      const effect = Effect.gen(function* () {
        return yield* listMappingsByOrg(query.orgId);
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
  .get("/by-project/:projectId", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getMappingsByProject(params.projectId);
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
  })
  .get("/by-scope", async ({ query }) => {
    const effect = Effect.gen(function* () {
      return yield* getMappingsByScope(
        query.source as Source,
        query.externalScopeId
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
  }, {
    query: t.Object({
      source: t.String(),
      externalScopeId: t.String(),
    }),
  })
  .post(
    "/",
    async ({ body }) => {
      const effect = Effect.gen(function* () {
        const mapping = yield* createSourceMapping({
          organizationId: body.organizationId,
          source: body.source as Source,
          externalScopeType: body.externalScopeType as ExternalScopeType,
          externalScopeId: body.externalScopeId,
          projectId: body.projectId,
          mappingType: body.mappingType as MappingType,
          confidence: body.confidence,
        });
        return mapping;
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
      body: t.Object({
        organizationId: t.String(),
        source: t.String(),
        externalScopeType: t.String(),
        externalScopeId: t.String(),
        projectId: t.String(),
        mappingType: t.String(),
        confidence: t.Optional(t.Number()),
      }),
    }
  )
  .delete("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      yield* deleteSourceMapping(params.id);
    }).pipe(Effect.provide(SurrealDb));

    try {
      await Effect.runPromise(effect);
      return { ok: true as const };
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