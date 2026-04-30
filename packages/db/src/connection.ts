import { Surreal } from "surrealdb";
import { env } from "@timesheet-ai/env/server";
import { createLogger } from "@timesheet-ai/observability";

const log = createLogger({ module: "db:connection" });

let dbInstance: Surreal | null = null;

export const getDb = async (): Promise<Surreal> => {
  if (dbInstance) return dbInstance;

  const db = new Surreal();
  await db.connect(env.SURREALDB_URL, {
    namespace: env.SURREALDB_NAMESPACE,
    database: env.SURREALDB_DATABASE,
    auth: {
      username: env.SURREALDB_USER,
      password: env.SURREALDB_PASS,
    },
  });

  dbInstance = db;
  log.info("SurrealDB connected", {
    url: env.SURREALDB_URL,
    ns: env.SURREALDB_NAMESPACE,
    db: env.SURREALDB_DATABASE,
  });

  return dbInstance;
};

export const closeDb = async (): Promise<void> => {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    log.info("SurrealDB connection closed");
  }
};