import { generateWorkUnit, type WorkUnitOutput } from "@timesheet-ai/ai";
import {
  createWorkUnit,
  deleteWorkUnitsByOrg,
  listClustersBySession,
  listEnrichedEventsByOrg,
  listSessionsByOrg,
  SurrealDb,
} from "@timesheet-ai/db";
import type { ActivityCluster, NormalizedEvent } from "@timesheet-ai/domain";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

const getTodayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const runWorkUnitGeneration = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = metadata?.organizationId as string | undefined;
    if (!organizationId) {
      return yield* Effect.fail(
        new Error(
          "work-unit-generation job requires organizationId in metadata"
        )
      );
    }

    const dateFilter = (metadata?.date as string | undefined) ?? getTodayDate();

    yield* logInfo("Starting work unit generation", {
      organizationId,
      dateFilter,
    });

    yield* deleteWorkUnitsByOrg(organizationId);

    yield* logInfo("Deleted existing work units for recompute", {
      organizationId,
    });

    const sessions = yield* listSessionsByOrg(organizationId);

    const datePrefix = `${dateFilter}T`;
    const filteredSessions = sessions.filter((s) =>
      String(s.startedAt).startsWith(datePrefix)
    );

    yield* logInfo("Loaded sessions", {
      count: filteredSessions.length,
      organizationId,
      dateFilter,
    });

    const enrichedEvents = yield* listEnrichedEventsByOrg(organizationId);
    const eventsById = new Map(
      enrichedEvents.map((e) => [e.id, e as unknown as NormalizedEvent])
    );

    const allClusters: ActivityCluster[] = [];
    for (const session of filteredSessions) {
      const sessionIdStr = String(session.id).replace("activity_session:", "");
      const clusters = yield* listClustersBySession(sessionIdStr);
      allClusters.push(...clusters);
    }

    yield* logInfo("Loaded clusters", {
      count: allClusters.length,
      organizationId,
    });

    for (const cluster of allClusters) {
      const clusterEvents = cluster.eventIds
        .map((id) => eventsById.get(id))
        .filter((e): e is NormalizedEvent => e !== undefined);

      if (clusterEvents.length === 0) {
        continue;
      }

      const rawOutput = yield* Effect.promise(() =>
        generateWorkUnit(cluster, clusterEvents)
      );
      const workUnitOutput = rawOutput as WorkUnitOutput;

      const clusterOrgId = cluster.organizationId.startsWith("organization:")
        ? cluster.organizationId.replace("organization:", "")
        : cluster.organizationId;

      const canonicalUserId = cluster.canonicalUserId.startsWith(
        "canonical_user:"
      )
        ? cluster.canonicalUserId.replace("canonical_user:", "")
        : cluster.canonicalUserId;

      const projectId = cluster.projectId?.startsWith("project:")
        ? cluster.projectId.replace("project:", "")
        : (cluster.projectId ?? "unknown");

      const clusterDate = cluster.startedAt.split("T")[0] ?? dateFilter;

      const sourceTypes = [
        ...new Set(clusterEvents.map((e) => e.source).filter(Boolean)),
      ];

      yield* createWorkUnit({
        organizationId: clusterOrgId,
        canonicalUserId,
        projectId,
        date: clusterDate,
        title: workUnitOutput.title,
        summary: workUnitOutput.summary,
        evidenceEventIds: cluster.eventIds,
        startedAt: cluster.startedAt,
        endedAt: cluster.endedAt,
        estimatedMinutes: workUnitOutput.estimatedMinutes,
        sourceTypes,
        confidence: workUnitOutput.confidence,
      });
    }

    yield* logInfo("Work unit generation complete", {
      clustersProcessed: allClusters.length,
      organizationId,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Work unit generation job failed", {
          error: String(error),
        });
      }).pipe(Effect.provide(SurrealDb))
    )
  );
