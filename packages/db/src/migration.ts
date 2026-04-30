import { createLogger } from "@timesheet-ai/observability";
import type { Surreal } from "surrealdb";
import { INDEX_DEFINITIONS } from "./schema/indexes";
import { TABLE_DEFINITIONS } from "./schema/tables";

const log = createLogger({ module: "db:migration" });

export const runMigrations = async (db: Surreal): Promise<void> => {
  log.info("Running schema migrations...", {
    tables: TABLE_DEFINITIONS.length,
    indexes: INDEX_DEFINITIONS.length,
  });

  for (const statement of TABLE_DEFINITIONS) {
    try {
      await db.query(statement);
    } catch (err) {
      log.error("Schema statement failed", {
        statement: statement.slice(0, 80),
        error: String(err),
      });
      throw err;
    }
  }

  for (const statement of INDEX_DEFINITIONS) {
    try {
      await db.query(statement);
    } catch (err) {
      log.warn("Index statement skipped (may already exist)", {
        statement: statement.slice(0, 80),
        error: String(err),
      });
    }
  }

  log.info("Schema migrations complete");
};
