import { Effect } from "effect";
import type { NormalizedEvent, RawEventPayload } from "@timesheet-ai/domain";
import { NotFoundError } from "@timesheet-ai/shared";
import { generateId } from "@timesheet-ai/shared";
import { SurrealDbTag } from "../connection";

export const storeRawPayload = (input: {
  organizationId: string;
  source: string;
  connectionId: string;
  externalEventId: string;
  payload: unknown;
  checksum: string;
}) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const id = generateId("raw");
    const recordId = `raw_event_payload:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      source: input.source,
      connectionId: `integration_connection:${input.connectionId}`,
      externalEventId: input.externalEventId,
      payload: input.payload,
      checksum: input.checksum,
    })) as unknown as [RawEventPayload];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "RawPayload", id }),
      );
    }
    return created;
  });

export const storeNormalizedEvent = (event: Omit<NormalizedEvent, "id">) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const id = generateId("evt");
    const recordId = `normalized_event:${id}`;

    const [created] = (yield* db.create(recordId, event)) as unknown as [
      NormalizedEvent,
    ];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "NormalizedEvent", id }),
      );
    }
    return created;
  });

export const getEventsByUserAndDateRange = (
  canonicalUserId: string,
  dateStart: string,
  dateEnd: string,
) =>
  Effect.gen(function*() {
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
      },
    )) as unknown as [NormalizedEvent[]];
    return (result ?? []) as NormalizedEvent[];
  });
