import type { ReviewStatus, WorkUnit } from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "work_unit";

export const createWorkUnit = (input: {
  organizationId: string;
  canonicalUserId: string;
  projectId: string;
  date: string;
  title: string;
  summary: string;
  evidenceEventIds: readonly string[];
  startedAt: string;
  endedAt: string;
  estimatedMinutes: number;
  sourceTypes: readonly string[];
  confidence: number;
  reviewStatus?: ReviewStatus;
  generationVersion?: number;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("work");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      canonicalUserId: `canonical_user:${input.canonicalUserId}`,
      projectId: `project:${input.projectId}`,
      date: input.date,
      title: input.title,
      summary: input.summary,
      evidenceEventIds: [...input.evidenceEventIds],
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      estimatedMinutes: input.estimatedMinutes,
      sourceTypes: [...input.sourceTypes],
      confidence: input.confidence,
      reviewStatus: input.reviewStatus ?? "draft",
      generationVersion: input.generationVersion ?? 1,
    })) as unknown as [WorkUnit];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "WorkUnit", id })
      );
    }
    return created;
  });

export const getWorkUnit = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as WorkUnit | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "WorkUnit", id })
      );
    }
    return result;
  });

export const listWorkUnitsByUser = (
  canonicalUserId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM work_unit
       WHERE canonicalUserId = $userId
       AND date >= $start
       AND date <= $end
       ORDER BY startedAt ASC`,
      {
        userId: `canonical_user:${canonicalUserId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [WorkUnit[]];
    return (result ?? []) as WorkUnit[];
  });

export const listWorkUnitsByProject = (
  projectId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM work_unit
       WHERE projectId = $projId
       AND date >= $start
       AND date <= $end
       ORDER BY startedAt ASC`,
      {
        projId: `project:${projectId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [WorkUnit[]];
    return (result ?? []) as WorkUnit[];
  });

export const listWorkUnitsByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM work_unit
       WHERE organizationId = $orgId
       ORDER BY startedAt ASC`,
      { orgId: `organization:${organizationId}` }
    )) as unknown as [WorkUnit[]];
    return (result ?? []) as WorkUnit[];
  });

export const deleteWorkUnitsByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.query("DELETE FROM work_unit WHERE organizationId = $orgId", {
      orgId: `organization:${organizationId}`,
    });
  });
