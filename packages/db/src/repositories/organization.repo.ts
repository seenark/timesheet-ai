import type {
  CreateOrganizationInput,
  Organization,
} from "@timesheet-ai/domain";
import { err, generateId, ok, type Result } from "@timesheet-ai/shared";
import type { Surreal } from "surrealdb";

const TABLE = "organization";

export const createOrganization = async (
  db: Surreal,
  input: CreateOrganizationInput
): Promise<Result<Organization>> => {
  const id = generateId("org");
  const recordId = `${TABLE}:${id}`;

  const [created] = (await db.create(recordId, {
    name: input.name,
    slug: input.slug,
  })) as unknown as [Organization];

  if (!created) {
    return err("Failed to create organization");
  }
  return ok(created as Organization);
};

export const getOrganization = async (
  db: Surreal,
  id: string
): Promise<Result<Organization>> => {
  const result = (await db.select(
    `${TABLE}:${id}`
  )) as unknown as Organization | null;
  if (!result) {
    return err("Organization not found");
  }
  return ok(result as Organization);
};

export const getOrganizationBySlug = async (
  db: Surreal,
  slug: string
): Promise<Result<Organization>> => {
  const queryResult = (await db.query(
    "SELECT * FROM organization WHERE slug = $slug LIMIT 1",
    { slug }
  )) as unknown as [Organization[]];

  const org = queryResult[0]?.[0];
  if (!org) {
    return err("Organization not found");
  }
  return ok(org as Organization);
};
