import { getPendingJobs, SurrealDb, updateJobStatus } from "@timesheet-ai/db";
import { logError, logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";

type JobHandler = (metadata?: Record<string, unknown>) => Effect.Effect<void>;

const handlers = new Map<string, JobHandler>();

export const registerJobHandler = (
  jobType: string,
  handler: JobHandler
): void => {
  handlers.set(jobType, handler);
  logInfo("Registered job handler", { jobType });
};

export const pollAndExecute = (): Effect.Effect<number> =>
  Effect.gen(function* () {
    const jobs = yield* getPendingJobs();

    let executed = 0;
    for (const job of jobs) {
      const handler = handlers.get(job.jobType);
      if (!handler) {
        yield* logWarn("No handler for job type", {
          jobType: job.jobType,
          jobId: job.id,
        });
        continue;
      }

      yield* updateJobStatus(job.id, "running");
      yield* logInfo("Executing job", { jobId: job.id, jobType: job.jobType });

      const result = yield* Effect.either(
        handler(job.metadata as Record<string, unknown> | undefined)
      );

      if (result._tag === "Left") {
        yield* updateJobStatus(job.id, "failed", String(result.left));
        yield* logError("Job failed", {
          jobId: job.id,
          error: String(result.left),
        });
      } else {
        yield* updateJobStatus(job.id, "completed");
        yield* logInfo("Job completed", { jobId: job.id });
      }

      executed++;
    }

    return executed;
  }).pipe(
    Effect.catchAll((error: unknown) => {
      logError("Job poll cycle failed", { error: String(error) });
      return Effect.succeed(0);
    }),
    Effect.provide(SurrealDb)
  );
