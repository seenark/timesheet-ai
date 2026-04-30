import {
  createAuditLog,
  getExternalIdentity,
  listUnmatchedIdentities,
  SurrealDb,
  setIdentitiesStatus,
} from "@timesheet-ai/db";
import type { IdentityStatus } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const identityRoutes = new Elysia({ prefix: "/identities" })
  .get(
    "/",
    async ({ query }) => {
      const effect = Effect.gen(function* () {
        return yield* listUnmatchedIdentities(query.orgId);
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
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getExternalIdentity(params.id);
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
  .patch(
    "/:id",
    async ({ params, body, headers }) => {
      const actorUserId = headers["x-user-id"] ?? "system";
      const effect = Effect.gen(function* () {
        const identity = yield* getExternalIdentity(params.id);
        const status = body.status as IdentityStatus;
        const canonicalUserId = body.canonicalUserId as string | undefined;

        yield* setIdentitiesStatus(
          [params.id],
          status,
          canonicalUserId,
          body.confidence as number | undefined
        );

        if (canonicalUserId) {
          yield* createAuditLog({
            organizationId: identity.organizationId as string,
            actorUserId,
            action:
              status === "matched"
                ? "identity.linked"
                : "identity.status_updated",
            targetType: "identity",
            targetId: params.id,
            previousValue: { status: identity.status },
            newValue: { status, canonicalUserId },
          });
        }

        return yield* getExternalIdentity(params.id);
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
        status: t.String(),
        canonicalUserId: t.Optional(t.String()),
        confidence: t.Optional(t.Number()),
      }),
    }
  );
