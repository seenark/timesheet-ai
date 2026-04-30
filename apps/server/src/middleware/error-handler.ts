import { logError, logWarn } from "@timesheet-ai/observability";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@timesheet-ai/shared";
import { Elysia } from "elysia";

const mapErrorToStatus = (
  error: unknown
): { status: number; code: string; message: string } => {
  if (error instanceof ValidationError) {
    return { status: 400, code: "VALIDATION_ERROR", message: error.message };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, code: "NOT_FOUND", message: error.message };
  }
  if (error instanceof UnauthorizedError) {
    return { status: 401, code: "UNAUTHORIZED", message: error.message };
  }
  if (error instanceof ForbiddenError) {
    return { status: 403, code: "FORBIDDEN", message: error.message };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
  };
};

export const errorHandler = new Elysia().onError(({ code, error, set }) => {
  const isAppError =
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof UnauthorizedError ||
    error instanceof ForbiddenError;

  if (isAppError) {
    const { status, code: errorCode, message } = mapErrorToStatus(error);
    set.status = status;
    logWarn("App error", { code: errorCode, message });
    return {
      ok: false as const,
      error: errorCode,
      message,
    };
  }

  logError("Unhandled error", { code, error: String(error) });
  set.status = code === "VALIDATION" ? 400 : 500;
  return {
    ok: false as const,
    error: "INTERNAL_ERROR",
    message:
      code === "VALIDATION" ? "Validation error" : "Internal server error",
  };
});
