import { Data } from "effect";

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string;
  readonly id: string;
}> {
  get message() {
    return `${this.resource} not found: ${this.id}`;
  }
}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly details?: Record<string, unknown>;
}> {}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly message: string;
}> {
  constructor(props?: { readonly message: string }) {
    super(props ?? { message: "Unauthorized" });
  }
}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly message: string;
}> {
  constructor(props?: { readonly message: string }) {
    super(props ?? { message: "Forbidden" });
  }
}
