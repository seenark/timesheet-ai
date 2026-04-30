import { Elysia } from "elysia";
import { clusterRoutes } from "./clusters";
import { dailySummaryRoutes } from "./daily-summaries";
import { eventRoutes } from "./events";
import { healthRoutes } from "./health";
import { identityRoutes } from "./identities";
import { integrationRoutes } from "./integrations";
import { mappingRoutes } from "./mappings";
import { reviewRoutes } from "./review";
import { sessionRoutes } from "./sessions";
import { webhookRoutes } from "./webhooks";
import { workUnitRoutes } from "./work-units";

export const routes = new Elysia()
  .use(healthRoutes)
  .use(integrationRoutes)
  .use(eventRoutes)
  .use(identityRoutes)
  .use(mappingRoutes)
  .use(reviewRoutes)
  .use(sessionRoutes)
  .use(clusterRoutes)
  .use(webhookRoutes)
  .use(workUnitRoutes)
  .use(dailySummaryRoutes);
