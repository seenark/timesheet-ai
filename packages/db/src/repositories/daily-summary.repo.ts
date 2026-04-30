import type {
  DailySummary,
  SummaryScopeType,
  SummaryStatus,
} from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "daily_summary";

export const createDailySummary = (input: {
  organizationId: string;
  scopeType: SummaryScopeType;
  scopeId: string;
  date: string;
  summary: string;
  workUnitIds: readonly string[];
  status?: SummaryStatus;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("sum");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      date: input.date,
      summary: input.summary,
      workUnitIds: [...input.workUnitIds],
      status: input.status ?? "draft",
    })) as unknown as [DailySummary];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "DailySummary", id })
      );
    }
    return created;
  });

export const getDailySummary = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as DailySummary | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "DailySummary", id })
      );
    }
    return result;
  });

export const listSummariesByScope = (
  scopeType: SummaryScopeType,
  scopeId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM daily_summary
       WHERE scopeType = $scopeType
       AND scopeId = $scope
       AND date >= $start
       AND date <= $end
       ORDER BY date ASC`,
      {
        scopeType,
        scope: scopeId,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [DailySummary[]];
    return (result ?? []) as DailySummary[];
  });

export const listSummariesByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM daily_summary
       WHERE organizationId = $orgId
       ORDER BY date ASC`,
      { orgId: `organization:${organizationId}` }
    )) as unknown as [DailySummary[]];
    return (result ?? []) as DailySummary[];
  });

export const listSummariesByOrgDateRange = (
  organizationId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM daily_summary
       WHERE organizationId = $orgId
       AND date >= $start
       AND date <= $end
       ORDER BY date ASC`,
      {
        orgId: `organization:${organizationId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [DailySummary[]];
    return (result ?? []) as DailySummary[];
  });

export const deleteSummariesByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.query("DELETE FROM daily_summary WHERE organizationId = $orgId", {
      orgId: `organization:${organizationId}`,
    });
  });
