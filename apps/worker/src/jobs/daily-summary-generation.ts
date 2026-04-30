import { generateDailySummary } from "@timesheet-ai/ai";
import {
  createDailySummary,
  deleteSummariesByOrg,
  listProjectsByOrg,
  listUsersByOrg,
  listWorkUnitsByProject,
  listWorkUnitsByUser,
  SurrealDb,
} from "@timesheet-ai/db";
import type { CanonicalUser, Project, WorkUnit } from "@timesheet-ai/domain";
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

const processUserSummaries = (
  users: CanonicalUser[],
  organizationId: string,
  date: string,
  dateStart: string,
  dateEnd: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* logInfo("Processing user summaries", {
      userCount: users.length,
      organizationId,
      date,
    });

    const orgIdStr = normalizeOrgId(organizationId);

    for (const user of users) {
      const userIdStr = String(user.id).replace("canonical_user:", "");
      const workUnits = yield* listWorkUnitsByUser(
        userIdStr,
        dateStart,
        dateEnd
      );

      if (workUnits.length === 0) {
        continue;
      }

      yield* createSummaryForUser(userIdStr, workUnits, date, orgIdStr);
    }
  });

const createSummaryForUser = (
  userIdStr: string,
  workUnits: WorkUnit[],
  date: string,
  orgIdStr: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const summaryOutput = yield* Effect.promise(() =>
      generateDailySummary(workUnits, "user", userIdStr, date)
    );

    yield* createDailySummary({
      organizationId: orgIdStr,
      scopeType: "user",
      scopeId: userIdStr,
      date,
      summary: summaryOutput.summary,
      workUnitIds: workUnits.map((wu) => wu.id),
    });
  });

const processProjectSummaries = (
  projects: Project[],
  organizationId: string,
  date: string,
  dateStart: string,
  dateEnd: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* logInfo("Processing project summaries", {
      projectCount: projects.length,
      organizationId,
      date,
    });

    const orgIdStr = normalizeOrgId(organizationId);

    for (const project of projects) {
      const projectIdStr = String(project.id).replace("project:", "");
      const workUnits = yield* listWorkUnitsByProject(
        projectIdStr,
        dateStart,
        dateEnd
      );

      if (workUnits.length === 0) {
        continue;
      }

      yield* createSummaryForProject(projectIdStr, workUnits, date, orgIdStr);
    }
  });

const createSummaryForProject = (
  projectIdStr: string,
  workUnits: WorkUnit[],
  date: string,
  orgIdStr: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const summaryOutput = yield* Effect.promise(() =>
      generateDailySummary(workUnits, "project", projectIdStr, date)
    );

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

    const dateStart = `${date}T00:00:00Z`;
    const dateEnd = `${date}T23:59:59Z`;

    if (scopeType === "user" || scopeType === "both") {
      const users = yield* listUsersByOrg(organizationId);
      yield* processUserSummaries(
        users,
        organizationId,
        date,
        dateStart,
        dateEnd
      );
    }

    if (scopeType === "project" || scopeType === "both") {
      const projects = yield* listProjectsByOrg(organizationId);
      yield* processProjectSummaries(
        projects,
        organizationId,
        date,
        dateStart,
        dateEnd
      );
    }

    yield* logInfo("Daily summary generation complete", {
      organizationId,
      date,
      scopeType,
    });

    yield* deleteSummariesByOrg(organizationId);

    yield* logInfo("Deleted existing summaries for recompute", {
      organizationId,
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
