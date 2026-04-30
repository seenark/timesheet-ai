import { getDb } from "@timesheet-ai/db";
import { Elysia } from "elysia";

export const healthRoutes = new Elysia({ prefix: "/health" })
  .get("/", () => ({
    ok: true as const,
    status: "healthy",
    timestamp: new Date().toISOString(),
  }))
  .get("/db", async () => {
    const db = await getDb();
    await db.query("SELECT count() AS total FROM organization GROUP BY total LIMIT 1");
    return {
      ok: true as const,
      status: "healthy",
      db: "connected",
      timestamp: new Date().toISOString(),
    };
  });