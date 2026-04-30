import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@timesheet-ai/shared";

export const mapErrorToStatus = (
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

export const handleEffectError = (error: unknown): Response => {
  const { status, code, message } = mapErrorToStatus(error);
  return new Response(JSON.stringify({ ok: false, error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
