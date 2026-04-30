import type { Surreal } from "surrealdb";
import { getPendingJobs, updateJobStatus } from "@timesheet-ai/db";
import { createLogger } from "@timesheet-ai/observability";
import { type Result, isErr, isOk } from "@timesheet-ai/shared";

const log = createLogger({ module: "worker:job-runner" });

type JobHandler = (db: Surreal, metadata?: Record<string, unknown>) => Promise<Result<void>>;

const handlers = new Map<string, JobHandler>();

export const registerJobHandler = (jobType: string, handler: JobHandler): void => {
  handlers.set(jobType, handler);
  log.info("Registered job handler", { jobType });
};

export const pollAndExecute = async (db: Surreal): Promise<number> => {
  const pendingJobs = await getPendingJobs(db);

  let executed = 0;
  for (const job of pendingJobs) {
    const handler = handlers.get(job.jobType);
    if (!handler) {
      log.warn("No handler for job type", { jobType: job.jobType, jobId: job.id });
      continue;
    }

    await updateJobStatus(db, job.id, "running");
    log.info("Executing job", { jobId: job.id, jobType: job.jobType });

    const result = await handler(db, job.metadata as Record<string, unknown> | undefined);

    if (isOk(result)) {
      await updateJobStatus(db, job.id, "completed");
      log.info("Job completed", { jobId: job.id });
    } else if (isErr(result)) {
      await updateJobStatus(db, job.id, "failed", result.error);
      log.error("Job failed", { jobId: job.id, error: result.error });
    }

    executed++;
  }

  return executed;
};