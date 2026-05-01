import type { ExternalIdentityCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { PlaneIssueEnvelope } from "./types";

const isIssueEnvelope = (payload: unknown): payload is PlaneIssueEnvelope => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.issue === "object" &&
    p.issue !== null &&
    Array.isArray(p.issue.assignees) &&
    Array.isArray(p.activities) &&
    Array.isArray(p.comments)
  );
};

const deduplicateCandidates = (
  candidates: readonly ExternalIdentityCandidate[]
): ExternalIdentityCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.source}:${c.externalId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const extractPlaneIdentities = (
  rawPayload: unknown
): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (!isIssueEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract identities from unknown Plane payload type",
          source: "plane",
        })
      );
    }

    const candidates: ExternalIdentityCandidate[] = [];

    candidates.push({
      source: "plane",
      externalId: rawPayload.issue.created_by,
    });

    for (const assigneeId of rawPayload.issue.assignees) {
      candidates.push({
        source: "plane",
        externalId: assigneeId,
      });
    }

    for (const activity of rawPayload.activities) {
      candidates.push({
        source: "plane",
        externalId: activity.actor,
      });
    }

    for (const comment of rawPayload.comments) {
      candidates.push({
        source: "plane",
        externalId: comment.actor,
      });
    }

    return deduplicateCandidates(candidates);
  });
