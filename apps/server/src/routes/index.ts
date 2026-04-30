import { Elysia } from "elysia";
import { eventRoutes } from "./events";
import { healthRoutes } from "./health";
import { identityRoutes } from "./identities";
import { integrationRoutes } from "./integrations";
import { mappingRoutes } from "./mappings";
import { reviewRoutes } from "./review";
import { webhookRoutes } from "./webhooks";

export const routes = new Elysia()
  .use(healthRoutes)
  .use(integrationRoutes)
  .use(eventRoutes)
  .use(identityRoutes)
  .use(mappingRoutes)
  .use(reviewRoutes)
  .use(webhookRoutes);
