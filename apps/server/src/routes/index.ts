import { Elysia } from "elysia";
import { eventRoutes } from "./events";
import { healthRoutes } from "./health";
import { integrationRoutes } from "./integrations";

export const routes = new Elysia()
  .use(healthRoutes)
  .use(integrationRoutes)
  .use(eventRoutes);
