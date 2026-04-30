import {
  createReviewDecision,
  listReviewDecisionsByTarget,
  SurrealDb,
} from "@timesheet-ai/db";
import type { ReviewDecision } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const reviewRoutes = new Elysia({ prefix: "/review" })
  .post(
    "/decisions",
    async ({ body, headers }) => {
      const reviewerId = headers["x-user-id"];
      if (!reviewerId) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "UNAUTHORIZED",
            message: "x-user-id header required",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      const effect = Effect.gen(function* () {
        return yield* createReviewDecision({
          organizationId: body.organizationId,
          reviewerId,
          targetType: body.targetType as ReviewDecision["targetType"],
          targetId: body.targetId,
          decision: body.decision as ReviewDecision["decision"],
          note: body.note,
        });
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
        targetType: t.String(),
        targetId: t.String(),
        decision: t.String(),
        note: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/decisions/by-target",
    async ({ query }) => {
      const effect = Effect.gen(function* () {
        return yield* listReviewDecisionsByTarget(
          query.targetType as ReviewDecision["targetType"],
          query.targetId
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
        targetType: t.String(),
        targetId: t.String(),
      }),
    }
  );