import type { Surreal } from "surrealdb";
import type { CanonicalUser, CreateUserInput, UserRole } from "@timesheet-ai/domain";
import { generateId, type Result, err, ok } from "@timesheet-ai/shared";

const TABLE = "canonical_user";

export const createUser = async (
  db: Surreal,
  input: CreateUserInput & { passwordHash: string },
): Promise<Result<CanonicalUser>> => {
  const id = generateId("user");
  const recordId = `${TABLE}:${id}`;

  const [created] = await db.create(recordId, {
    organizationId: `organization:${input.organizationId}`,
    displayName: input.displayName,
    primaryEmail: input.primaryEmail,
    role: input.role,
    passwordHash: input.passwordHash,
  }) as unknown as [CanonicalUser];

  if (!created) return err("Failed to create user");
  return ok(created as CanonicalUser);
};

export const getUser = async (
  db: Surreal,
  id: string,
): Promise<Result<CanonicalUser>> => {
  const result = await db.select(`${TABLE}:${id}`) as unknown as CanonicalUser | null;
  if (!result) return err("User not found");
  return ok(result as CanonicalUser);
};

export const getUserByEmail = async (
  db: Surreal,
  email: string,
): Promise<Result<CanonicalUser>> => {
  const queryResult = await db.query(
    "SELECT * FROM canonical_user WHERE primaryEmail = $email LIMIT 1",
    { email },
  ) as unknown as [CanonicalUser[]];

  const user = queryResult[0]?.[0];
  if (!user) return err("User not found");
  return ok(user as CanonicalUser);
};

export const listUsersByOrg = async (
  db: Surreal,
  organizationId: string,
  role?: UserRole,
): Promise<CanonicalUser[]> => {
  const query = role
    ? "SELECT * FROM canonical_user WHERE organizationId = $orgId AND role = $role AND active = true"
    : "SELECT * FROM canonical_user WHERE organizationId = $orgId AND active = true";

  const [result] = await db.query(query, {
    orgId: `organization:${organizationId}`,
    role,
  }) as unknown as [CanonicalUser[]];
  return (result ?? []) as CanonicalUser[];
};