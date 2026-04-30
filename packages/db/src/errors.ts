import { Data } from "effect";

export class DbConnectionError extends Data.TaggedError("DbConnectionError")<{
  readonly cause: unknown;
}> {}

export class DbQueryError extends Data.TaggedError("DbQueryError")<{
  readonly query: string;
  readonly cause: unknown;
}> {}
