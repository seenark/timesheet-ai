import type { ActivitySession } from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "activity_session";

export const createSession = (input: {
  organizationId: string;
  canonicalUserId: string;
  startedAt: string;
  endedAt: string;
  eventIds: readonly string[];
  projectIds: readonly string[];
  confidence: number;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("sess");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      canonicalUserId: `canonical_user:${input.canonicalUserId}`,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      eventIds: [...input.eventIds],
      projectIds: [...input.projectIds],
      confidence: input.confidence,
    })) as unknown as [ActivitySession];

    if (!created) {
      return yield* Effect.fail(new NotFoundError({ resource: "ActivitySession", id }));
    }
    return created;
  });

export const getSession = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as ActivitySession | null;
    if (!result) {
      return yield* Effect.fail(new NotFoundError({ resource: "ActivitySession", id }));
    }
    return result;
  });

export const listSessionsByUser = (
  canonicalUserId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM activity_session
       WHERE canonicalUserId = $userId
       AND startedAt >= $start
       AND endedAt <= $end
       ORDER BY startedAt ASC`,
      {
        userId: `canonical_user:${canonicalUserId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [ActivitySession[]];
    return (result ?? []) as ActivitySession[];
  });

export const listSessionsByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM activity_session
       WHERE organizationId = $orgId
       ORDER BY startedAt DESC`,
      { orgId: `organization:${organizationId}` }
    )) as unknown as [ActivitySession[]];
    return (result ?? []) as ActivitySession[];
  });

export const deleteSessionsByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.query(
      "DELETE FROM activity_session WHERE organizationId = $orgId",
      { orgId: `organization:${organizationId}` }
    );
  });
