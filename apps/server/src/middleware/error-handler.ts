import { createLogger } from "@timesheet-ai/observability";
import { AppError } from "@timesheet-ai/shared";
import { Elysia } from "elysia";

const log = createLogger({ module: "api:error-handler" });

export const errorHandler = new Elysia().onError(({ code, error, set }) => {
  if (error instanceof AppError) {
    set.status = error.statusCode;
    log.warn("App error", { code: error.code, message: error.message });
    return {
      ok: false as const,
      error: error.code,
      message: error.message,
    };
  }

  log.error("Unhandled error", { code, error: String(error) });
  set.status = code === "VALIDATION" ? 400 : 500;
  return {
    ok: false as const,
    error: "INTERNAL_ERROR",
    message:
      code === "VALIDATION" ? "Validation error" : "Internal server error",
  };
});
