import type {
  CreateExternalIdentityInput,
  ExternalIdentity,
  IdentityStatus,
  Source,
} from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "external_identity";

export const createExternalIdentity = (input: CreateExternalIdentityInput) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("extid");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      source: input.source,
      externalId: input.externalId,
      username: input.username,
      email: input.email,
      displayName: input.displayName,
      status: "unmatched" as IdentityStatus,
    })) as unknown as [ExternalIdentity];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "ExternalIdentity", id })
      );
    }
    return created;
  });

export const getExternalIdentity = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as ExternalIdentity | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "ExternalIdentity", id })
      );
    }
    return result;
  });

export const findIdentityBySourceAndExternalId = (
  source: Source,
  externalId: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM external_identity WHERE source = $source AND externalId = $externalId LIMIT 1",
      { source, externalId }
    )) as unknown as [ExternalIdentity[]];
    return result?.[0] ?? null;
  });

export const setIdentitiesStatus = (
  ids: string[],
  status: IdentityStatus,
  canonicalUserId?: string,
  confidence?: number
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.query(
      "UPDATE external_identity SET status = $status, canonicalUserId = $canonicalUserId, confidence = $confidence WHERE id INSIDE $ids",
      {
        status,
        canonicalUserId: canonicalUserId
          ? `canonical_user:${canonicalUserId}`
          : null,
        confidence: confidence ?? null,
        ids: ids.map((id) => `${TABLE}:${id}`),
      }
    );
  });

export const listUnmatchedIdentities = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM external_identity WHERE organizationId = $orgId AND status = 'unmatched'",
      { orgId: `organization:${organizationId}` }
    )) as unknown as [ExternalIdentity[]];
    return (result ?? []) as ExternalIdentity[];
  });
