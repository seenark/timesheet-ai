import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    SURREALDB_URL: z.url().default("http://localhost:8000"),
    SURREALDB_NAMESPACE: z.string().default("timesheet"),
    SURREALDB_DATABASE: z.string().default("production"),
    SURREALDB_USER: z.string().default("root"),
    SURREALDB_PASS: z.string().default("root"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
