import { Context, Data, Effect, Layer } from "effect";
import { env } from "@timesheet-ai/env/server";
import { logInfo } from "@timesheet-ai/observability";
import { Surreal } from "surrealdb";

export class DbConnectionError extends Data.TaggedError("DbConnectionError")<{
  readonly cause: unknown;
}> {}

export class DbQueryError extends Data.TaggedError("DbQueryError")<{
  readonly query: string;
  readonly cause: unknown;
}> {}

export interface ISurrealDb {
  readonly query: (
    surql: string,
    params?: Record<string, unknown>,
  ) => Effect.Effect<unknown, DbQueryError>;
  readonly create: (
    recordId: string,
    data: unknown,
  ) => Effect.Effect<unknown, DbQueryError>;
  readonly select: (
    recordId: string,
  ) => Effect.Effect<unknown, DbQueryError>;
  readonly merge: (
    recordId: string,
    data: unknown,
  ) => Effect.Effect<unknown, DbQueryError>;
  readonly raw: Surreal;
}

export const SurrealDbTag = Context.GenericTag<ISurrealDb>("SurrealDb");

const connectDb = Effect.gen(function*() {
  const client = new Surreal();
  yield* Effect.promise(() =>
    client.connect(env.SURREALDB_URL, {
      namespace: env.SURREALDB_NAMESPACE,
      database: env.SURREALDB_DATABASE,
      auth: {
        username: env.SURREALDB_USER,
        password: env.SURREALDB_PASS,
      },
    }),
  );
  yield* logInfo("SurrealDB connected", {
    url: env.SURREALDB_URL,
    ns: env.SURREALDB_NAMESPACE,
    db: env.SURREALDB_DATABASE,
  });
  return client;
});

const makeSurrealDb = (db: Surreal): ISurrealDb => {
  const query = (surql: string, params?: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.query(surql, params);
        return result as unknown;
      },
      catch: (e) => new DbQueryError({ query: surql, cause: e }),
    });

  const create = (recordId: string, data: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.create(recordId as never, data as never);
        return result as unknown;
      },
      catch: (e) =>
        new DbQueryError({ query: `create ${recordId}`, cause: e }),
    });

  const select = (recordId: string) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.select(recordId as never);
        return result as unknown;
      },
      catch: (e) =>
        new DbQueryError({ query: `select ${recordId}`, cause: e }),
    });

  const merge = (recordId: string, data: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.merge(recordId as never, data as never);
        return result as unknown;
      },
      catch: (e) =>
        new DbQueryError({ query: `merge ${recordId}`, cause: e }),
    });

  return {
    query,
    create,
    select,
    merge,
    raw: db,
  };
};

const SurrealDbLive = Layer.effect(
  SurrealDbTag,
  Effect.flatMap(connectDb, (db) => Effect.sync(() => makeSurrealDb(db))),
);

export { SurrealDbLive as SurrealDb };
