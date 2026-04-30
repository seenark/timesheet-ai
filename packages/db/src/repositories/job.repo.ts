import type { JobRun } from "@timesheet-ai/domain";
import { err, generateId, ok, type Result } from "@timesheet-ai/shared";
import type { Surreal } from "surrealdb";

const TABLE = "job_run";

export const createJobRun = async (
  db: Surreal,
  input: {
    organizationId: string;
    jobType: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Result<JobRun>> => {
  const id = generateId("job");
  const recordId = `${TABLE}:${id}`;

  const [created] = (await db.create(recordId, {
    organizationId: `organization:${input.organizationId}`,
    jobType: input.jobType,
    status: "pending",
    metadata: input.metadata,
  })) as unknown as [JobRun];

  if (!created) {
    return err("Failed to create job run");
  }
  return ok(created as JobRun);
};

export const updateJobStatus = async (
  db: Surreal,
  id: string,
  status: JobRun["status"],
  error?: string
): Promise<Result<JobRun>> => {
  const updates: Record<string, unknown> = { status };
  if (status === "completed" || status === "failed") {
    updates.completedAt = new Date().toISOString();
  }
  if (error) {
    updates.error = error;
  }

  const updated = (await db.merge(
    `${TABLE}:${id}`,
    updates
  )) as unknown as JobRun | null;
  if (!updated) {
    return err("Failed to update job run");
  }
  return ok(updated as JobRun);
};

export const getPendingJobs = async (
  db: Surreal,
  jobType?: string
): Promise<JobRun[]> => {
  const query = jobType
    ? "SELECT * FROM job_run WHERE status = 'pending' AND jobType = $jobType ORDER BY startedAt ASC"
    : "SELECT * FROM job_run WHERE status = 'pending' ORDER BY startedAt ASC";

  const [result] = (await db.query(query, { jobType })) as unknown as [
    JobRun[],
  ];
  return (result ?? []) as JobRun[];
};
