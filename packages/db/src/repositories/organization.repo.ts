import { Effect } from "effect";
import type {
  CreateOrganizationInput,
  Organization,
} from "@timesheet-ai/domain";
import { NotFoundError } from "@timesheet-ai/shared";
import { generateId } from "@timesheet-ai/shared";
import { SurrealDbTag } from "../connection";

const TABLE = "organization";

export const createOrganization = (input: CreateOrganizationInput) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const id = generateId("org");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      name: input.name,
      slug: input.slug,
    })) as unknown as [Organization];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "Organization", id }),
      );
    }
    return created;
  });

export const getOrganization = (id: string) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(`${TABLE}:${id}`)) as unknown as
      | Organization
      | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "Organization", id }),
      );
    }
    return result;
  });

export const getOrganizationBySlug = (slug: string) =>
  Effect.gen(function*() {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM organization WHERE slug = $slug LIMIT 1",
      { slug },
    )) as unknown as [Organization[]];

    const org = result?.[0];
    if (!org) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "Organization", id: slug }),
      );
    }
    return org;
  });
