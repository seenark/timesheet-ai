import { Effect } from "effect";
import type {
  CanonicalUser,
  CreateUserInput,
  UserRole,
} from "@timesheet-ai/domain";
import { NotFoundError } from "@timesheet-ai/shared";
import { generateId } from "@timesheet-ai/shared";
import { SurrealDbTag } from "../connection";

const TABLE = "canonical_user";

export const createUser = (
  input: CreateUserInput & { passwordHash: string },
) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const id = generateId("user");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      displayName: input.displayName,
      primaryEmail: input.primaryEmail,
      role: input.role,
      passwordHash: input.passwordHash,
    })) as unknown as [CanonicalUser];

    if (!created) {
      return yield* Effect.fail(new NotFoundError({ resource: "User", id }));
    }
    return created;
  });

export const getUser = (id: string) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(`${TABLE}:${id}`)) as unknown as
      | CanonicalUser
      | null;
    if (!result) {
      return yield* Effect.fail(new NotFoundError({ resource: "User", id }));
    }
    return result;
  });

export const getUserByEmail = (email: string) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM canonical_user WHERE primaryEmail = $email LIMIT 1",
      { email },
    )) as unknown as [CanonicalUser[]];

    const user = result?.[0];
    if (!user) {
      return yield* Effect.fail(new NotFoundError({ resource: "User", id: email }));
    }
    return user;
  });

export const listUsersByOrg = (
  organizationId: string,
  role?: UserRole,
) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const query = role
      ? "SELECT * FROM canonical_user WHERE organizationId = $orgId AND role = $role AND active = true"
      : "SELECT * FROM canonical_user WHERE organizationId = $orgId AND active = true";

    const [result] = (yield* db.query(query, {
      orgId: `organization:${organizationId}`,
      role,
    })) as unknown as [CanonicalUser[]];
    return (result ?? []) as CanonicalUser[];
  });
