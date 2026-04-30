import type {
  IntegrationConnection,
  IntegrationStatus,
  Source,
} from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "integration_connection";

export const createIntegrationConnection = (input: {
  organizationId: string;
  source: Source;
  name: string;
  configRef: string;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("conn");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      source: input.source,
      name: input.name,
      status: "active" as IntegrationStatus,
      configRef: input.configRef,
    })) as unknown as [IntegrationConnection];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "IntegrationConnection", id })
      );
    }
    return created;
  });

export const getIntegrationConnection = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const result = (yield* db.select(
      `${TABLE}:${id}`
    )) as unknown as IntegrationConnection | null;
    if (!result) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "IntegrationConnection", id })
      );
    }
    return result;
  });

export const listConnectionsByOrg = (organizationId: string, source?: Source) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const query = source
      ? "SELECT * FROM integration_connection WHERE organizationId = $orgId AND source = $source"
      : "SELECT * FROM integration_connection WHERE organizationId = $orgId";

    const [result] = (yield* db.query(query, {
      orgId: `organization:${organizationId}`,
      source,
    })) as unknown as [IntegrationConnection[]];
    return (result ?? []) as IntegrationConnection[];
  });

export const updateConnectionStatus = (id: string, status: IntegrationStatus) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const updated = (yield* db.merge(`${TABLE}:${id}`, {
      status,
    })) as unknown as IntegrationConnection | null;
    if (!updated) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "IntegrationConnection", id })
      );
    }
    return updated;
  });
