import {
  SurrealDb,
  createIntegrationConnection,
  createJobRun,
  getIntegrationConnection,
  listConnectionsByOrg,
  updateConnectionStatus,
} from "@timesheet-ai/db";
import type { Source } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const integrationRoutes = new Elysia({
  prefix: "/integrations",
})
  .get("/", async ({ query }) => {
    const effect = Effect.gen(function* () {
      const connections = yield* listConnectionsByOrg(
        query.orgId,
        query.source as Source | undefined
      );
      return connections;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({
      orgId: t.String(),
      source: t.Optional(t.String()),
    }),
  })
  .post("/", async ({ body }) => {
    const effect = Effect.gen(function* () {
      const connection = yield* createIntegrationConnection({
        organizationId: body.organizationId,
        source: body.source as Source,
        name: body.name,
        configRef: body.configRef,
      });
      return connection;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      organizationId: t.String(),
      source: t.String(),
      name: t.String(),
      configRef: t.String(),
    }),
  })
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getIntegrationConnection(params.id);
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "NOT_FOUND", message: String(error) }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  })
  .patch("/:id/status", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      return yield* updateConnectionStatus(params.id, body.status as "active" | "paused" | "error");
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      status: t.String(),
    }),
  })
  .post("/:id/sync", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      const connection = yield* getIntegrationConnection(params.id);
      const job = yield* createJobRun({
        organizationId: connection.organizationId as string,
        jobType: "ingestion-sync",
        metadata: {
          connectionId: params.id,
          rawPayloads: (body as { rawPayloads?: unknown })?.rawPayloads,
        },
      });
      return job;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      rawPayloads: t.Optional(t.Any()),
    }),
  });
