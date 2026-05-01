import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { PlaneIssue, PlaneIssueEnvelope } from "./types";

const PLANE_SOURCE: Source = "plane";

const isIssueEnvelope = (payload: unknown): payload is PlaneIssueEnvelope => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.issue === "object" &&
    p.issue !== null
  );
};

const normalizeIssue = (
  issue: PlaneIssue,
  sourceEventType: string
): Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> => ({
  source: PLANE_SOURCE,
  sourceEventType,
  eventTime: issue.updated_at,
  sourceRef: {
    connectionId: "",
    externalEventId: issue.id,
    externalScopeId: `${issue.workspace__slug}/${issue.project_detail.slug}`,
    externalUrl: issue.url,
  },
  content: {
    title: issue.name,
    body: issue.description_html,
    taskId: String(issue.sequence_id),
    taskStatus: issue.state?.name,
    tags: issue.labels?.map((l) => l.name),
  },
  attribution: {
    attributionMethod: "direct",
  },
  processingVersion: 1,
});

export const normalizePlanePayload = (
  rawPayload: unknown
): Effect.Effect<readonly NormalizedEvent[], IngestionError> =>
  Effect.gen(function* () {
    if (!isIssueEnvelope(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Unknown Plane payload type",
          source: "plane",
        })
      );
    }

    const events: Array<Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt">> = [];
    const issue = rawPayload.issue;
    const isNew = issue.created_at === issue.updated_at;

    events.push(
      normalizeIssue(issue, isNew ? "issue.created" : "issue.updated")
    );

    for (const activity of rawPayload.activities) {
      const eventType =
        activity.field === "state"
          ? "issue.status_changed"
          : activity.field === "assignees"
            ? "issue.assignee_changed"
            : "issue.updated";

      events.push({
        source: PLANE_SOURCE,
        sourceEventType: eventType,
        eventTime: activity.created_at,
        sourceRef: {
          connectionId: "",
          externalEventId: activity.id,
          externalScopeId: `${issue.workspace__slug}/${issue.project_detail.slug}`,
          externalUrl: issue.url,
        },
        content: {
          title: issue.name,
          taskId: String(issue.sequence_id),
          taskStatus: activity.new_value ?? undefined,
          tags: [activity.verb],
        },
        attribution: { attributionMethod: "direct" },
        processingVersion: 1,
      });
    }

    for (const comment of rawPayload.comments) {
      events.push({
        source: PLANE_SOURCE,
        sourceEventType: "issue.comment_added",
        eventTime: comment.created_at,
        sourceRef: {
          connectionId: "",
          externalEventId: comment.id,
          externalScopeId: `${issue.workspace__slug}/${issue.project_detail.slug}`,
          externalUrl: issue.url,
        },
        content: {
          title: issue.name,
          body: comment.comment_html,
          taskId: String(issue.sequence_id),
        },
        attribution: { attributionMethod: "direct" },
        processingVersion: 1,
      });
    }

    return events as NormalizedEvent[];
  });