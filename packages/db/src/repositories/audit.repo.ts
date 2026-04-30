import type { AuditLog } from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "audit_log";

export const createAuditLog = (input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("aud");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      actorUserId: `canonical_user:${input.actorUserId}`,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
    })) as unknown as [AuditLog];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "AuditLog", id })
      );
    }
    return created;
  });

export const listAuditLogsByTarget = (targetType: string, targetId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM audit_log
       WHERE targetType = $targetType AND targetId = $targetId
       ORDER BY timestamp DESC`,
      { targetType, targetId }
    )) as unknown as [AuditLog[]];
    return (result ?? []) as AuditLog[];
  });
