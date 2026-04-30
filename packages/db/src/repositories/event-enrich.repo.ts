import type { AttributionMethod } from "@timesheet-ai/domain";
import { NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "normalized_event";

export const enrichEvent = (input: {
  eventId: string;
  canonicalUserId?: string;
  projectId?: string;
  attributionMethod: AttributionMethod;
  identityConfidence: number;
  projectConfidence: number;
  ruleId?: string;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const updated = (yield* db.merge(`${TABLE}:${input.eventId}`, {
      canonicalUserId: input.canonicalUserId
        ? `canonical_user:${input.canonicalUserId}`
        : null,
      projectId: input.projectId ? `project:${input.projectId}` : null,
      attribution: {
        attributionMethod: input.attributionMethod,
        identityConfidence: input.identityConfidence,
        projectConfidence: input.projectConfidence,
        ruleId: input.ruleId,
      },
    })) as unknown as Record<string, unknown> | null;
    if (!updated) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "NormalizedEvent", id: input.eventId })
      );
    }
    return updated;
  });

export const getNormalizedEvent = (eventId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${eventId}`
    )) as unknown as Record<string, unknown> | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "NormalizedEvent", id: eventId })
      );
    }
    return result;
  });

export const listEventsForEnrichment = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM normalized_event
       WHERE organizationId = $orgId
       AND attribution.attributionMethod IS NONE
       ORDER BY eventTime ASC
       LIMIT 100`,
      { orgId: `organization:${organizationId}` }
    )) as unknown as [Record<string, unknown>[]];
    return (result ?? []) as Record<string, unknown>[];
  });

export const listEventsByCanonicalUser = (
  canonicalUserId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM normalized_event
       WHERE canonicalUserId = $userId
       AND eventTime >= $start
       AND eventTime <= $end
       ORDER BY eventTime ASC`,
      {
        userId: `canonical_user:${canonicalUserId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [Record<string, unknown>[]];
    return (result ?? []) as Record<string, unknown>[];
  });
