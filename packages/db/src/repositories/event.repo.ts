import type { Surreal } from "surrealdb";
import type { NormalizedEvent, RawEventPayload } from "@timesheet-ai/domain";
import { generateId, type Result, err, ok } from "@timesheet-ai/shared";

export const storeRawPayload = async (
  db: Surreal,
  input: {
    organizationId: string;
    source: string;
    connectionId: string;
    externalEventId: string;
    payload: unknown;
    checksum: string;
  },
): Promise<Result<RawEventPayload>> => {
  const id = generateId("raw");
  const recordId = `raw_event_payload:${id}`;

  const [created] = await db.create(recordId, {
    organizationId: `organization:${input.organizationId}`,
    source: input.source,
    connectionId: `integration_connection:${input.connectionId}`,
    externalEventId: input.externalEventId,
    payload: input.payload,
    checksum: input.checksum,
  }) as unknown as [RawEventPayload];

  if (!created) return err("Failed to store raw payload");
  return ok(created as RawEventPayload);
};

export const storeNormalizedEvent = async (
  db: Surreal,
  event: Omit<NormalizedEvent, "id">,
): Promise<Result<NormalizedEvent>> => {
  const id = generateId("evt");
  const recordId = `normalized_event:${id}`;

  const [created] = await db.create(recordId, event) as unknown as [NormalizedEvent];

  if (!created) return err("Failed to store normalized event");
  return ok(created as NormalizedEvent);
};

export const getEventsByUserAndDateRange = async (
  db: Surreal,
  canonicalUserId: string,
  dateStart: string,
  dateEnd: string,
): Promise<NormalizedEvent[]> => {
  const [result] = await db.query(
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
  ) as unknown as [NormalizedEvent[]];
  return (result ?? []) as NormalizedEvent[];
};