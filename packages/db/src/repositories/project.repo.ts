import type { Surreal } from "surrealdb";
import type { CreateProjectInput, Project } from "@timesheet-ai/domain";
import { generateId, type Result, err, ok } from "@timesheet-ai/shared";

const TABLE = "project";

export const createProject = async (
  db: Surreal,
  input: CreateProjectInput,
): Promise<Result<Project>> => {
  const id = generateId("proj");
  const recordId = `${TABLE}:${id}`;

  const [created] = await db.create(recordId, {
    organizationId: `organization:${input.organizationId}`,
    name: input.name,
    code: input.code,
    type: input.type,
  }) as unknown as [Project];

  if (!created) return err("Failed to create project");
  return ok(created as Project);
};

export const getProject = async (
  db: Surreal,
  id: string,
): Promise<Result<Project>> => {
  const result = await db.select(`${TABLE}:${id}`) as unknown as Project | null;
  if (!result) return err("Project not found");
  return ok(result as Project);
};

export const listProjectsByOrg = async (
  db: Surreal,
  organizationId: string,
): Promise<Project[]> => {
  const [result] = await db.query(
    "SELECT * FROM project WHERE organizationId = $orgId AND status = 'active'",
    { orgId: `organization:${organizationId}` },
  ) as unknown as [Project[]];
  return (result ?? []) as Project[];
};