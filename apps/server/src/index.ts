import { cors } from "@elysiajs/cors";
import { env } from "@timesheet-ai/env/server";
import { Elysia } from "elysia";
import { errorHandler } from "./middleware/error-handler";
import { routes } from "./routes";

const app = new Elysia()
  .use(cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
  }))
  .use(errorHandler)
  .use(routes)
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

export type App = typeof app;