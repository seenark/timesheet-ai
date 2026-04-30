import { Elysia } from "elysia";
import { healthRoutes } from "./health";

export const routes = new Elysia().use(healthRoutes);
