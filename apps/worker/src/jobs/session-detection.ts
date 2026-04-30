import {
  createCluster,
  createSession,
  deleteClustersByOrg,
  deleteSessionsByOrg,
  listEnrichedEventsByOrg,
  SurrealDb,
} from "@timesheet-ai/db";
import { logError, logInfo } from "@timesheet-ai/observability";
import {
  DEFAULT_CONFIG,
  detectClusters,
  detectSessions,
  type SessionInput,
} from "@timesheet-ai/sessionization";
import { Effect } from "effect";

const toSessionInput = (e: Record<string, unknown>): SessionInput => {
  const content =
    e.content && typeof e.content === "object"
      ? (e.content as Record<string, unknown>)
      : {};
  return {
    canonicalUserId: String(e.canonicalUserId ?? "").replace(
      "canonical_user:",
      ""
    ),
    eventTime: String(e.eventTime ?? ""),
    id: String(e.id ?? ""),
    organizationId: String(e.organizationId ?? "").replace("organization:", ""),
    projectId: e.projectId
      ? String(e.projectId).replace("project:", "")
      : undefined,
    source: String(e.source ?? ""),
    sourceEventType: String(e.sourceEventType ?? ""),
    content: {
      branch: content.branch as string | undefined,
      taskId: content.taskId as string | undefined,
      message: content.message as string | undefined,
      title: content.title as string | undefined,
    },
  };
};

export const runSessionDetection = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = metadata?.organizationId as string | undefined;
    if (!organizationId) {
      return yield* Effect.fail(
        new Error("session-detection job requires organizationId in metadata")
      );
    }

    const sessionGapMinutes =
      (metadata?.sessionGapMinutes as number) ??
      DEFAULT_CONFIG.sessionGapMinutes;

    yield* logInfo("Starting session detection", {
      organizationId,
      sessionGapMinutes,
    });

    const events = yield* listEnrichedEventsByOrg(organizationId);

    yield* logInfo("Loaded enriched events", {
      count: events.length,
      organizationId,
    });

    const sessionInputs = events.map(toSessionInput);

    const sessions = detectSessions(sessionInputs, {
      ...DEFAULT_CONFIG,
      sessionGapMinutes,
    });

    yield* deleteSessionsByOrg(organizationId);
    yield* deleteClustersByOrg(organizationId);

    let totalClusters = 0;
    for (const session of sessions) {
      const avgConfidence = session.eventIds.length > 0 ? 0.7 : 0;

      const createdSession = yield* createSession({
        organizationId: session.organizationId,
        canonicalUserId: session.canonicalUserId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        eventIds: session.eventIds,
        projectIds: session.projectIds,
        confidence: avgConfidence,
      });

      const sessionIdStr = String(createdSession.id).replace(
        "activity_session:",
        ""
      );
      const sessionEvents = sessionInputs.filter((e) =>
        session.eventIds.includes(e.id)
      );

      const clusters = detectClusters(sessionEvents, sessionIdStr);

      for (const cluster of clusters) {
        yield* createCluster({
          organizationId: cluster.organizationId,
          canonicalUserId: cluster.canonicalUserId,
          projectId: cluster.projectId,
          sessionId: sessionIdStr,
          eventIds: cluster.eventIds,
          topicLabel: cluster.topicLabel,
          clusterType: cluster.clusterType,
          startedAt: cluster.startedAt,
          endedAt: cluster.endedAt,
          confidence: avgConfidence,
        });
        totalClusters++;
      }
    }

    yield* logInfo("Session detection complete", {
      sessionsCreated: sessions.length,
      clustersCreated: totalClusters,
      organizationId,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Session detection job failed", {
          error: String(error),
        });
      }).pipe(Effect.provide(SurrealDb))
    )
  );
