import type { CreateProjectInput, Project } from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "project";

export const createProject = (input: CreateProjectInput) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("proj");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      name: input.name,
      code: input.code,
      type: input.type,
    })) as unknown as [Project];

    if (!created) {
      return yield* Effect.fail(new NotFoundError({ resource: "Project", id }));
    }
    return created;
  });

export const getProject = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as Project | null;
    if (!result) {
      return yield* Effect.fail(new NotFoundError({ resource: "Project", id }));
    }
    return result;
  });

export const listProjectsByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM project WHERE organizationId = $orgId AND status = 'active'",
      { orgId: `organization:${organizationId}` }
    )) as unknown as [Project[]];
    return (result ?? []) as Project[];
  });
