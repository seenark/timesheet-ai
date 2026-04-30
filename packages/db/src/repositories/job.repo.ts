import { Effect } from "effect";
import type { JobRun } from "@timesheet-ai/domain";
import { NotFoundError } from "@timesheet-ai/shared";
import { generateId } from "@timesheet-ai/shared";
import { SurrealDbTag } from "../connection";

const TABLE = "job_run";

export const createJobRun = (input: {
  organizationId: string;
  jobType: string;
  metadata?: Record<string, unknown>;
}) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const id = generateId("job");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      jobType: input.jobType,
      status: "pending",
      metadata: input.metadata,
    })) as unknown as [JobRun];

    if (!created) {
      return yield* Effect.fail(new NotFoundError({ resource: "JobRun", id }));
    }
    return created;
  });

export const updateJobStatus = (
  id: string,
  status: JobRun["status"],
  error?: string,
) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const updates: Record<string, unknown> = { status };
    if (status === "completed" || status === "failed") {
      updates.completedAt = new Date().toISOString();
    }
    if (error) {
      updates.error = error;
    }

    const updated = (yield* db.merge(`${TABLE}:${id}`, updates)) as unknown as
      | JobRun
      | null;
    if (!updated) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "JobRun", id }),
      );
    }
    return updated;
  });

export const getPendingJobs = (jobType?: string) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const query = jobType
      ? "SELECT * FROM job_run WHERE status = 'pending' AND jobType = $jobType ORDER BY startedAt ASC"
      : "SELECT * FROM job_run WHERE status = 'pending' ORDER BY startedAt ASC";

    const [result] = (yield* db.query(query, { jobType })) as unknown as [
      JobRun[],
    ];
    return (result ?? []) as JobRun[];
  });
