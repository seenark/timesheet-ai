import type {
  ExternalScopeType,
  MappingType,
  Source,
  SourceMapping,
} from "@timesheet-ai/domain";
import { generateId, NotFoundError } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

const TABLE = "source_mapping";

export const createSourceMapping = (input: {
  organizationId: string;
  source: Source;
  externalScopeType: ExternalScopeType;
  externalScopeId: string;
  projectId: string;
  mappingType: MappingType;
  confidence?: number;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("smap");
    const recordId = `${TABLE}:${id}`;

    const [created] = (yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      source: input.source,
      externalScopeType: input.externalScopeType,
      externalScopeId: input.externalScopeId,
      projectId: `project:${input.projectId}`,
      confidence: input.confidence ?? 1.0,
      mappingType: input.mappingType,
    })) as unknown as [SourceMapping];

    if (!created) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "SourceMapping", id })
      );
    }
    return created;
  });

export const getMappingsByScope = (source: Source, externalScopeId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM source_mapping WHERE source = $source AND externalScopeId = $externalScopeId",
      { source, externalScopeId }
    )) as unknown as [SourceMapping[]];
    return (result ?? []) as SourceMapping[];
  });

export const getMappingsByProject = (projectId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM source_mapping WHERE projectId = $projectId",
      { projectId: `project:${projectId}` }
    )) as unknown as [SourceMapping[]];
    return (result ?? []) as SourceMapping[];
  });

export const listMappingsByOrg = (organizationId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM source_mapping WHERE organizationId = $orgId",
      { orgId: `organization:${organizationId}` }
    )) as unknown as [SourceMapping[]];
    return (result ?? []) as SourceMapping[];
  });

export const deleteSourceMapping = (id: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.query("DELETE FROM source_mapping WHERE id = $id", {
      id: `${TABLE}:${id}`,
    });
  });
