import {
  type DailySummaryOutput,
  generateDailySummary,
} from "@timesheet-ai/ai";
import {
  createDailySummary,
  deleteSummariesByOrg,
  listProjectsByOrg,
  listUsersByOrg,
  listWorkUnitsByProject,
  listWorkUnitsByUser,
  SurrealDb,
} from "@timesheet-ai/db";
import type { WorkUnit } from "@timesheet-ai/domain";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

const getTodayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeOrgId = (orgId: string): string =>
  orgId.startsWith("organization:")
    ? orgId.replace("organization:", "")
    : orgId;

const createSummaryForUser = (
  userIdStr: string,
  workUnits: WorkUnit[],
  date: string,
  orgIdStr: string
) =>
  Effect.gen(function* () {
    const rawOutput = yield* Effect.promise(() =>
      generateDailySummary(workUnits, "user", userIdStr, date)
    );
    const summaryOutput = rawOutput as DailySummaryOutput;

    yield* createDailySummary({
      organizationId: orgIdStr,
      scopeType: "user",
      scopeId: userIdStr,
      date,
      summary: summaryOutput.summary,
      workUnitIds: workUnits.map((wu) => wu.id),
    });
  });

const createSummaryForProject = (
  projectIdStr: string,
  workUnits: WorkUnit[],
  date: string,
  orgIdStr: string
) =>
  Effect.gen(function* () {
    const rawOutput = yield* Effect.promise(() =>
      generateDailySummary(workUnits, "project", projectIdStr, date)
    );
    const summaryOutput = rawOutput as DailySummaryOutput;

    yield* createDailySummary({
      organizationId: orgIdStr,
      scopeType: "project",
      scopeId: projectIdStr,
      date,
      summary: summaryOutput.summary,
      workUnitIds: workUnits.map((wu) => wu.id),
    });
  });

export const runDailySummaryGeneration = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = metadata?.organizationId as string | undefined;
    if (!organizationId) {
      return yield* Effect.fail(
        new Error(
          "daily-summary-generation job requires organizationId in metadata"
        )
      );
    }

    const date = (metadata?.date as string | undefined) ?? getTodayDate();

    const scopeType =
      (metadata?.scopeType as "user" | "project" | "both") ?? "both";

    yield* logInfo("Starting daily summary generation", {
      organizationId,
      date,
      scopeType,
    });

    yield* deleteSummariesByOrg(organizationId);

    yield* logInfo("Deleted existing summaries for recompute", {
      organizationId,
    });

    const dateStart = `${date}T00:00:00Z`;
    const dateEnd = `${date}T23:59:59Z`;
    const orgIdStr = normalizeOrgId(organizationId);

    if (scopeType === "user" || scopeType === "both") {
      yield* logInfo("Processing user summaries", { organizationId, date });

      const users = yield* listUsersByOrg(organizationId);

      for (const user of users) {
        const userIdStr = String(user.id).replace("canonical_user:", "");
        const workUnitsResult = yield* Effect.either(
          listWorkUnitsByUser(userIdStr, dateStart, dateEnd)
        );

        if (workUnitsResult._tag === "Left") {
          yield* logError("Failed to fetch work units for user", {
            userId: userIdStr,
            error: String(workUnitsResult.left),
          });
          continue;
        }

        const workUnits = workUnitsResult.right;
        if (workUnits.length === 0) {
          continue;
        }

        const summaryResult = yield* Effect.either(
          createSummaryForUser(userIdStr, workUnits, date, orgIdStr)
        );
        if (summaryResult._tag === "Left") {
          yield* logError("Failed to create user summary", {
            userId: userIdStr,
            error: String(summaryResult.left),
          });
        }
      }
    }

    if (scopeType === "project" || scopeType === "both") {
      yield* logInfo("Processing project summaries", { organizationId, date });

      const projects = yield* listProjectsByOrg(organizationId);

      for (const project of projects) {
        const projectIdStr = String(project.id).replace("project:", "");
        const workUnitsResult = yield* Effect.either(
          listWorkUnitsByProject(projectIdStr, dateStart, dateEnd)
        );

        if (workUnitsResult._tag === "Left") {
          yield* logError("Failed to fetch work units for project", {
            projectId: projectIdStr,
            error: String(workUnitsResult.left),
          });
          continue;
        }

        const workUnits = workUnitsResult.right;
        if (workUnits.length === 0) {
          continue;
        }

        const summaryResult = yield* Effect.either(
          createSummaryForProject(projectIdStr, workUnits, date, orgIdStr)
        );
        if (summaryResult._tag === "Left") {
          yield* logError("Failed to create project summary", {
            projectId: projectIdStr,
            error: String(summaryResult.left),
          });
        }
      }
    }

    yield* logInfo("Daily summary generation complete", {
      organizationId,
      date,
      scopeType,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Daily summary generation job failed", {
          error: String(error),
        });
      }).pipe(Effect.provide(SurrealDb))
    )
  );
