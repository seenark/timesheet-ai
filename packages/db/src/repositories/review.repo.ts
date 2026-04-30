import type { ReviewDecision } from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "review_decision";

export const createReviewDecision = (input: {
  organizationId: string;
  reviewerId: string;
  targetType: ReviewDecision["targetType"];
  targetId: string;
  decision: ReviewDecision["decision"];
  note?: string;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("rev");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      reviewerId: `canonical_user:${input.reviewerId}`,
      targetType: input.targetType,
      targetId: input.targetId,
      decision: input.decision,
      note: input.note ?? null,
    })) as unknown as [ReviewDecision];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "ReviewDecision", id })
      );
    }
    return created;
  });

export const listReviewDecisionsByTarget = (
  targetType: ReviewDecision["targetType"],
  targetId: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM review_decision
       WHERE targetType = $targetType AND targetId = $targetId
       ORDER BY timestamp DESC`,
      { targetType, targetId }
    )) as unknown as [ReviewDecision[]];
    return (result ?? []) as ReviewDecision[];
  });
