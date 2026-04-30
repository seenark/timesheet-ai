import type { ActivityCluster } from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "activity_cluster";

export const createCluster = (input: {
  organizationId: string;
  canonicalUserId: string;
  projectId?: string;
  sessionId?: string;
  eventIds: readonly string[];
  topicLabel?: string;
  clusterType: string;
  startedAt: string;
  endedAt: string;
  confidence: number;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("clust");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      canonicalUserId: `canonical_user:${input.canonicalUserId}`,
      projectId: input.projectId ? `project:${input.projectId}` : null,
      sessionId: input.sessionId ? `activity_session:${input.sessionId}` : null,
      eventIds: [...input.eventIds],
      topicLabel: input.topicLabel ?? null,
      clusterType: input.clusterType,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      confidence: input.confidence,
    })) as unknown as [ActivityCluster];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "ActivityCluster", id })
      );
    }
    return created;
  });

export const getCluster = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as ActivityCluster | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "ActivityCluster", id })
      );
    }
    return result;
  });

export const listClustersBySession = (sessionId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM activity_cluster
       WHERE sessionId = $sessionId
       ORDER BY startedAt ASC`,
      { sessionId: `activity_session:${sessionId}` }
    )) as unknown as [ActivityCluster[]];
    return (result ?? []) as ActivityCluster[];
  });

export const listClustersByUser = (
  canonicalUserId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM activity_cluster
       WHERE canonicalUserId = $userId
       AND startedAt >= $start
       AND endedAt <= $end
       ORDER BY startedAt ASC`,
      {
        userId: `canonical_user:${canonicalUserId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [ActivityCluster[]];
    return (result ?? []) as ActivityCluster[];
  });

export const deleteClustersByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.query(
      "DELETE FROM activity_cluster WHERE organizationId = $orgId",
      { orgId: `organization:${organizationId}` }
    );
  });
