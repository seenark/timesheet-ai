import { healthRoutes } from "./health";
import { Elysia } from "elysia";

export const routes = new Elysia().use(healthRoutes);