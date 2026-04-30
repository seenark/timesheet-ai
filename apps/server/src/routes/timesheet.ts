import {
  listSummariesByOrgDateRange,
  listSummariesByScope,
  listWorkUnitsByOrgDateRange,
  listWorkUnitsByProject,
  listWorkUnitsByUser,
  SurrealDb,
} from "@timesheet-ai/db";
import type { WorkUnit } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const timesheetRoutes = new Elysia({ prefix: "/timesheet" }).get(
  "/",
  async ({ query }) => {
    const effect = Effect.gen(function* () {
      const dateStart = query.dateStart;
      const dateEnd = query.dateEnd;

      let workUnits: WorkUnit[] = [];
      if (query.userId) {
        workUnits = yield* listWorkUnitsByUser(
          query.userId,
          dateStart,
          dateEnd
        );
      } else if (query.projectId) {
        workUnits = yield* listWorkUnitsByProject(
          query.projectId,
          dateStart,
          dateEnd
        );
      } else {
        workUnits = yield* listWorkUnitsByOrgDateRange(
          query.orgId,
          dateStart,
          dateEnd
        );
      }

      const summaries = query.userId
        ? yield* listSummariesByScope("user", query.userId, dateStart, dateEnd)
        : yield* listSummariesByOrgDateRange(query.orgId, dateStart, dateEnd);

      const totalMinutes = workUnits.reduce(
        (sum, wu) => sum + wu.estimatedMinutes,
        0
      );

      return {
        summaries,
        totalMinutes,
        totalWorkUnits: workUnits.length,
        workUnits: workUnits.map(stripRecordPrefixes),
      };
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
      dateStart: t.String(),
      dateEnd: t.String(),
      userId: t.Optional(t.String()),
      projectId: t.Optional(t.String()),
    }),
  }
);

function stripRecordPrefixes(wu: WorkUnit) {
  return {
    ...wu,
    canonicalUserId: String(wu.canonicalUserId ?? "").replace(
      "canonical_user:",
      ""
    ),
    id: String(wu.id),
    organizationId: String(wu.organizationId ?? "").replace(
      "organization:",
      ""
    ),
    projectId: String(wu.projectId ?? "").replace("project:", ""),
  };
}
