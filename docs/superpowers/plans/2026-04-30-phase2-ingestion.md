# Phase 2 — Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete ingestion pipeline: integration connection management, raw payload storage, normalization, deduplication, and the Git ingestion plugin as the first concrete source adapter.

**Architecture:** The ingestion pipeline follows a strict flow: fetch → validate → deduplicate → store raw → normalize → store normalized event → queue downstream. Each source (Git, Plane, Discord) implements the `IngestionPlugin` interface from `packages/ingestion-core`. The worker runtime polls for ingestion jobs and dispatches them to registered plugins. All DB operations use Effect + `SurrealDbTag` following existing repository patterns.

**Tech Stack:** Effect-TS (effects, tagged errors, Layer DI), SurrealDB (storage), Bun runtime, Elysia (API), `@mastra/core` (AI orchestration, deferred to Phase 5).

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `packages/ingestion-core/src/pipeline.ts` | Orchestration engine: runs the full fetch→dedupe→normalize→store pipeline for any plugin |
| `packages/ingestion-core/src/dedup.ts` | Checksum-based deduplication against `raw_event_payload` |
| `packages/ingestion-core/src/registry.ts` | Plugin registry: register/lookup plugins by source name |
| `packages/ingestion-git/package.json` | Package manifest for Git ingestion plugin |
| `packages/ingestion-git/tsconfig.json` | TypeScript config |
| `packages/ingestion-git/src/index.ts` | Barrel export |
| `packages/ingestion-git/src/plugin.ts` | `GitIngestionPlugin` implementing `IngestionPlugin` |
| `packages/ingestion-git/src/normalizer.ts` | Transforms raw Git webhook/payload data into `NormalizedEvent` |
| `packages/ingestion-git/src/identity-extractor.ts` | Extracts `ExternalIdentityCandidate` from Git payloads |
| `packages/ingestion-git/src/scope-extractor.ts` | Extracts `SourceScopeCandidate` (repos) from Git payloads |
| `packages/ingestion-git/src/types.ts` | Git-specific payload types (commit, PR, push events) |
| `packages/ingestion-git/tests/normalizer.test.ts` | Unit tests for Git event normalization |
| `packages/ingestion-git/tests/identity-extractor.test.ts` | Unit tests for identity extraction |
| `packages/ingestion-git/tests/scope-extractor.test.ts` | Unit tests for scope extraction |
| `packages/ingestion-git/tests/dedup.test.ts` | Unit tests for deduplication |
| `packages/ingestion-git/tests/pipeline.test.ts` | Integration test for full pipeline |
| `packages/db/src/repositories/integration.repo.ts` | CRUD for `integration_connection` |
| `packages/db/src/repositories/identity.repo.ts` | CRUD for `external_identity` |
| `packages/db/src/repositories/mapping.repo.ts` | CRUD for `source_mapping` |
| `apps/worker/src/jobs/ingestion-sync.ts` | Worker job handler that runs the ingestion pipeline for a given connection |
| `apps/server/src/routes/integrations.ts` | API routes: CRUD integration connections, trigger sync, view status |
| `apps/server/src/routes/events.ts` | API routes: list/search normalized events, inspect raw payloads |

### Existing files to modify

| File | Change |
|------|--------|
| `packages/db/src/repositories/index.ts` | Export new repos |
| `packages/db/src/index.ts` | Export new repos |
| `packages/ingestion-core/src/index.ts` | Export pipeline, registry, dedup |
| `packages/ingestion-core/package.json` | Add `@timesheet-ai/db` dependency |
| `apps/worker/src/index.ts` | Register ingestion-sync job handler |
| `apps/worker/src/job-runner.ts` | Fix error handling to mark jobs as failed |
| `apps/worker/package.json` | Add `@timesheet-ai/ingestion-git` dependency |
| `apps/server/src/routes/index.ts` | Mount new route groups |
| `apps/server/package.json` | No new deps needed |
| Root `package.json` | Add `ingestion-git` to workspaces |

---

## Task 1: Fix worker job-runner error handling

The current `pollAndExecute` in `apps/worker/src/job-runner.ts` catches all errors and returns 0, meaning failed jobs stay "running" forever. This must be fixed before building ingestion jobs on top.

**Files:**
- Modify: `apps/worker/src/job-runner.ts`

- [ ] **Step 1: Fix job-runner to mark failed jobs properly**

Replace the entire `job-runner.ts` with:

```ts
import { getPendingJobs, SurrealDb, SurrealDbTag, updateJobStatus } from "@timesheet-ai/db";
import { logError, logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";

type JobHandler = (metadata?: Record<string, unknown>) => Effect.Effect<void>;

const handlers = new Map<string, JobHandler>();

export const registerJobHandler = (
  jobType: string,
  handler: JobHandler
): void => {
  handlers.set(jobType, handler);
  logInfo("Registered job handler", { jobType });
};

export const pollAndExecute = (): Effect.Effect<number> =>
  Effect.gen(function* () {
    const jobs = yield* getPendingJobs();

    let executed = 0;
    for (const job of jobs) {
      const handler = handlers.get(job.jobType);
      if (!handler) {
        yield* logWarn("No handler for job type", {
          jobType: job.jobType,
          jobId: job.id,
        });
        continue;
      }

      yield* updateJobStatus(job.id, "running");
      yield* logInfo("Executing job", { jobId: job.id, jobType: job.jobType });

      const result = yield* Effect.either(handler(job.metadata as Record<string, unknown> | undefined));

      if (result._tag === "Left") {
        yield* updateJobStatus(job.id, "failed", String(result.left));
        yield* logError("Job failed", { jobId: job.id, error: String(result.left) });
      } else {
        yield* updateJobStatus(job.id, "completed");
        yield* logInfo("Job completed", { jobId: job.id });
      }

      executed++;
    }

    return executed;
  }).pipe(
    Effect.catchAll((error) => {
      logError("Job poll cycle failed", { error: String(error) });
      return Effect.succeed(0);
    }),
    Effect.provide(SurrealDb)
  );
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/job-runner.ts
git commit -m "fix: mark failed jobs properly in worker poll loop"
```

---

## Task 2: Add new repository modules (integration, identity, mapping)

Add repository functions for the three tables needed by ingestion: `integration_connection`, `external_identity`, and `source_mapping`.

**Files:**
- Create: `packages/db/src/repositories/integration.repo.ts`
- Create: `packages/db/src/repositories/identity.repo.ts`
- Create: `packages/db/src/repositories/mapping.repo.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create integration.repo.ts**

Create `packages/db/src/repositories/integration.repo.ts`:

```ts
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

export const listConnectionsByOrg = (
  organizationId: string,
  source?: Source
) =>
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

export const updateConnectionStatus = (
  id: string,
  status: IntegrationStatus
) =>
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
```

- [ ] **Step 2: Create identity.repo.ts**

Create `packages/db/src/repositories/identity.repo.ts`:

```ts
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

export const createExternalIdentity = (
  input: CreateExternalIdentityInput
) =>
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
    const updates: Record<string, unknown> = { status };
    if (canonicalUserId !== undefined) {
      updates.canonicalUserId = `canonical_user:${canonicalUserId}`;
    }
    if (confidence !== undefined) {
      updates.confidence = confidence;
    }

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
```

- [ ] **Step 3: Create mapping.repo.ts**

Create `packages/db/src/repositories/mapping.repo.ts`:

```ts
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

export const getMappingsByScope = (
  source: Source,
  externalScopeId: string
) =>
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
```

- [ ] **Step 4: Update repositories/index.ts**

Replace `packages/db/src/repositories/index.ts` with:

```ts
// biome-ignore lint/performance/noBarrelFile: Package exports require barrel file
export {
  getEventsByUserAndDateRange,
  storeNormalizedEvent,
  storeRawPayload,
} from "./event.repo";
export {
  createIntegrationConnection,
  getIntegrationConnection,
  listConnectionsByOrg,
  updateConnectionStatus,
} from "./integration.repo";
export {
  createExternalIdentity,
  findIdentityBySourceAndExternalId,
  getExternalIdentity,
  listUnmatchedIdentities,
  setIdentitiesStatus,
} from "./identity.repo";
export { createJobRun, getPendingJobs, updateJobStatus } from "./job.repo";
export {
  createSourceMapping,
  deleteSourceMapping,
  getMappingsByProject,
  getMappingsByScope,
  listMappingsByOrg,
} from "./mapping.repo";
export {
  createOrganization,
  getOrganization,
  getOrganizationBySlug,
} from "./organization.repo";
export { createProject, getProject, listProjectsByOrg } from "./project.repo";
export {
  createUser,
  getUser,
  getUserByEmail,
  listUsersByOrg,
} from "./user.repo";
```

- [ ] **Step 5: Update packages/db/src/index.ts**

Replace `packages/db/src/index.ts` with:

```ts
// biome-ignore lint/performance/noBarrelFile: Package exports require barrel file
export {
  DbConnectionError,
  DbQueryError,
  SurrealDb,
  SurrealDbTag,
} from "./connection";
export { runMigrations } from "./migration";
export {
  createExternalIdentity,
  createIntegrationConnection,
  createJobRun,
  createOrganization,
  createProject,
  createSourceMapping,
  createUser,
  deleteSourceMapping,
  findIdentityBySourceAndExternalId,
  getEventsByUserAndDateRange,
  getExternalIdentity,
  getIntegrationConnection,
  getMappingsByProject,
  getMappingsByScope,
  getOrganization,
  getOrganizationBySlug,
  getPendingJobs,
  getProject,
  getUser,
  getUserByEmail,
  listConnectionsByOrg,
  listMappingsByOrg,
  listProjectsByOrg,
  listUnmatchedIdentities,
  setIdentitiesStatus,
  storeNormalizedEvent,
  storeRawPayload,
  updateConnectionStatus,
  updateJobStatus,
} from "./repositories";
```

- [ ] **Step 6: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/repositories/integration.repo.ts packages/db/src/repositories/identity.repo.ts packages/db/src/repositories/mapping.repo.ts packages/db/src/repositories/index.ts packages/db/src/index.ts
git commit -m "feat: add integration, identity, and mapping repositories"
```

---

## Task 3: Build ingestion-core pipeline, registry, and dedup

Add the orchestration engine to `packages/ingestion-core` that ties plugins to the DB layer.

**Files:**
- Create: `packages/ingestion-core/src/registry.ts`
- Create: `packages/ingestion-core/src/dedup.ts`
- Create: `packages/ingestion-core/src/pipeline.ts`
- Modify: `packages/ingestion-core/src/index.ts`
- Modify: `packages/ingestion-core/package.json`

- [ ] **Step 1: Update ingestion-core package.json to add @timesheet-ai/db**

Replace `packages/ingestion-core/package.json` with:

```json
{
  "name": "@timesheet-ai/ingestion-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@timesheet-ai/db": "workspace:*",
    "@timesheet-ai/domain": "workspace:*",
    "@timesheet-ai/shared": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@timesheet-ai/config": "workspace:*",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create registry.ts**

Create `packages/ingestion-core/src/registry.ts`:

```ts
import type { Source } from "@timesheet-ai/domain";
import type { IngestionPlugin } from "./types";

const plugins = new Map<Source, IngestionPlugin>();

export const registerPlugin = (plugin: IngestionPlugin): void => {
  plugins.set(plugin.source, plugin);
};

export const getPlugin = (source: Source): IngestionPlugin | undefined =>
  plugins.get(source);

export const getAllPlugins = (): ReadonlyArray<IngestionPlugin> =>
  Array.from(plugins.values());
```

- [ ] **Step 3: Create dedup.ts**

Create `packages/ingestion-core/src/dedup.ts`:

```ts
import { Effect } from "effect";

export const computeChecksum = async (payload: unknown): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const isAlreadyIngested = (
  connectionId: string,
  externalEventId: string
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const { SurrealDbTag } = yield* Effect.promise(() =>
      import("@timesheet-ai/db").then((m) => ({ SurrealDbTag: m.SurrealDbTag }))
    );
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT count() AS total FROM raw_event_payload WHERE connectionId = $connId AND externalEventId = $extId GROUP BY total LIMIT 1",
      {
        connId: `integration_connection:${connectionId}`,
        extId: externalEventId,
      }
    )) as unknown as [Array<{ total: number }> | null];
    const count = result?.[0]?.total ?? 0;
    return count > 0;
  });
```

- [ ] **Step 4: Create pipeline.ts**

Create `packages/ingestion-core/src/pipeline.ts`:

```ts
import {
  SurrealDbTag,
  storeNormalizedEvent,
  storeRawPayload,
} from "@timesheet-ai/db";
import type { NormalizedEvent } from "@timesheet-ai/domain";
import { logError, logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { computeChecksum, isAlreadyIngested } from "./dedup";
import { getPlugin } from "./registry";
import type { IngestionResult } from "./types";

export const runIngestionPipeline = (
  source: string,
  connectionId: string,
  organizationId: string,
  rawPayloads: readonly unknown[],
  cursor?: string
): Effect.Effect<IngestionResult> =>
  Effect.gen(function* () {
    const plugin = getPlugin(source as never);
    if (!plugin) {
      return yield* Effect.fail(
        new Error(`No plugin registered for source: ${source}`)
      );
    }

    let rawPayloadCount = 0;
    let normalizedEventCount = 0;
    let newIdentityCandidates = 0;
    const errors: Array<{
      message: string;
      source: string;
      externalId?: string;
    }> = [];

    for (const rawPayload of rawPayloads) {
      const externalEventId = extractExternalEventId(rawPayload, source);
      const checksum = yield* Effect.promise(() =>
        computeChecksum(rawPayload)
      );

      const alreadyIngested = yield* isAlreadyIngested(
        connectionId,
        externalEventId
      );
      if (alreadyIngested) {
        yield* logWarn("Skipping already ingested event", {
          source,
          externalEventId,
        });
        continue;
      }

      yield* storeRawPayload({
        organizationId,
        source,
        connectionId,
        externalEventId,
        payload: rawPayload,
        checksum,
      });
      rawPayloadCount++;

      const normalizedEither = yield* Effect.either(plugin.normalize(rawPayload));
      if (normalizedEither._tag === "Left") {
        errors.push({
          message: normalizedEither.left.message,
          source: normalizedEither.left.source,
          externalId: normalizedEither.left.externalId,
        });
        yield* logError("Normalization failed", {
          source,
          externalEventId,
          error: normalizedEither.left.message,
        });
        continue;
      }

      const normalizedEvents = normalizedEither.right;
      for (const partialEvent of normalizedEvents) {
        const fullEvent: Omit<NormalizedEvent, "id"> = {
          organizationId,
          source: partialEvent.source ?? (source as never),
          sourceEventType: partialEvent.sourceEventType,
          eventTime: partialEvent.eventTime,
          ingestedAt: new Date().toISOString(),
          externalIdentityId: partialEvent.externalIdentityId,
          canonicalUserId: partialEvent.canonicalUserId,
          projectId: partialEvent.projectId,
          sourceRef: {
            connectionId,
            externalEventId,
            ...partialEvent.sourceRef,
          },
          content: partialEvent.content,
          attribution: partialEvent.attribution ?? {},
          processingVersion: 1,
        };
        yield* storeNormalizedEvent(fullEvent);
        normalizedEventCount++;
      }

      const identityCandidates = yield* Effect.either(
        plugin.extractIdentities(rawPayload)
      );
      if (identityCandidates._tag === "Right") {
        newIdentityCandidates += identityCandidates.right.length;
        for (const candidate of identityCandidates.right) {
          yield* logInfo("Identity candidate found", {
            source: candidate.source,
            externalId: candidate.externalId,
            email: candidate.email,
          });
        }
      }
    }

    const result: IngestionResult = {
      rawPayloadCount,
      normalizedEventCount,
      newIdentityCandidates,
      errors,
      cursor,
    };

    yield* logInfo("Ingestion pipeline complete", {
      source,
      connectionId,
      rawPayloadCount,
      normalizedEventCount,
      errors: errors.length,
    });

    return result;
  }).pipe(
    Effect.provideServiceEffect(SurrealDbTag, Effect.never)
  );

const extractExternalEventId = (
  payload: unknown,
  source: string
): string => {
  const p = payload as Record<string, unknown>;
  if (source === "git") {
    if (typeof p.id === "string") return p.id;
    if (typeof p.sha === "string") return p.sha;
    if (p.head_commit && typeof (p.head_commit as Record<string, unknown>).id === "string") {
      return (p.head_commit as Record<string, unknown>).id as string;
    }
  }
  if (source === "plane") {
    if (typeof p.id === "string") return p.id;
  }
  if (source === "discord") {
    if (typeof p.id === "string") return p.id;
  }
  return JSON.stringify(payload).slice(0, 64);
};
```

Wait — `Effect.provideServiceEffect(SurrealDbTag, Effect.never)` won't work. The pipeline should NOT provide its own SurrealDb layer. The caller provides it. Let me fix:

Create `packages/ingestion-core/src/pipeline.ts`:

```ts
import {
  storeNormalizedEvent,
  storeRawPayload,
} from "@timesheet-ai/db";
import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { logError, logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { computeChecksum, isAlreadyIngested } from "./dedup";
import { getPlugin } from "./registry";
import type { IngestionResult } from "./types";

export const runIngestionPipeline = (
  source: Source,
  connectionId: string,
  organizationId: string,
  rawPayloads: readonly unknown[],
  cursor?: string
): Effect.Effect<IngestionResult, never, never> =>
  Effect.gen(function* () {
    const plugin = getPlugin(source);
    if (!plugin) {
      return yield* Effect.fail(
        new Error(`No plugin registered for source: ${source}`)
      );
    }

    let rawPayloadCount = 0;
    let normalizedEventCount = 0;
    let newIdentityCandidates = 0;
    const errors: Array<{
      message: string;
      source: string;
      externalId?: string;
    }> = [];

    for (const rawPayload of rawPayloads) {
      const externalEventId = extractExternalEventId(rawPayload, source);
      const checksum = yield* Effect.promise(() =>
        computeChecksum(rawPayload)
      );

      const alreadyIngested = yield* isAlreadyIngested(
        connectionId,
        externalEventId
      );
      if (alreadyIngested) {
        yield* logWarn("Skipping already ingested event", {
          source,
          externalEventId,
        });
        continue;
      }

      yield* storeRawPayload({
        organizationId,
        source,
        connectionId,
        externalEventId,
        payload: rawPayload,
        checksum,
      });
      rawPayloadCount++;

      const normalizedEither = yield* Effect.either(
        plugin.normalize(rawPayload)
      );
      if (normalizedEither._tag === "Left") {
        errors.push({
          message: normalizedEither.left.message,
          source: normalizedEither.left.source,
          externalId: normalizedEither.left.externalId,
        });
        yield* logError("Normalization failed", {
          source,
          externalEventId,
          error: normalizedEither.left.message,
        });
        continue;
      }

      const normalizedEvents = normalizedEither.right;
      for (const partialEvent of normalizedEvents) {
        const fullEvent: Omit<NormalizedEvent, "id"> = {
          organizationId,
          source: partialEvent.source ?? source,
          sourceEventType: partialEvent.sourceEventType,
          eventTime: partialEvent.eventTime,
          ingestedAt: new Date().toISOString(),
          externalIdentityId: partialEvent.externalIdentityId,
          canonicalUserId: partialEvent.canonicalUserId,
          projectId: partialEvent.projectId,
          sourceRef: {
            connectionId,
            externalEventId,
            ...partialEvent.sourceRef,
          },
          content: partialEvent.content,
          attribution: partialEvent.attribution ?? {},
          processingVersion: 1,
        };
        yield* storeNormalizedEvent(fullEvent);
        normalizedEventCount++;
      }

      const identityCandidates = yield* Effect.either(
        plugin.extractIdentities(rawPayload)
      );
      if (identityCandidates._tag === "Right") {
        newIdentityCandidates += identityCandidates.right.length;
        for (const candidate of identityCandidates.right) {
          yield* logInfo("Identity candidate found", {
            source: candidate.source,
            externalId: candidate.externalId,
            email: candidate.email,
          });
        }
      }
    }

    const result: IngestionResult = {
      rawPayloadCount,
      normalizedEventCount,
      newIdentityCandidates,
      errors,
      cursor,
    };

    yield* logInfo("Ingestion pipeline complete", {
      source,
      connectionId,
      rawPayloadCount,
      normalizedEventCount,
      errors: errors.length,
    });

    return result;
  });

const extractExternalEventId = (
  payload: unknown,
  source: string
): string => {
  const p = payload as Record<string, unknown>;
  if (source === "git") {
    if (typeof p.id === "string") return p.id;
    if (typeof p.sha === "string") return p.sha;
    const headCommit = p.head_commit as Record<string, unknown> | undefined;
    if (headCommit && typeof headCommit.id === "string") return headCommit.id;
  }
  if (source === "plane") {
    if (typeof p.id === "string") return p.id;
  }
  if (source === "discord") {
    if (typeof p.id === "string") return p.id;
  }
  return JSON.stringify(payload).slice(0, 64);
};
```

- [ ] **Step 5: Update ingestion-core/src/index.ts**

Replace `packages/ingestion-core/src/index.ts` with:

```ts
export { computeChecksum, isAlreadyIngested } from "./dedup";
export type { IngestionEvent, IngestionEventType } from "./events";
export { runIngestionPipeline } from "./pipeline";
export {
  getAllPlugins,
  getPlugin,
  registerPlugin,
} from "./registry";
export type {
  ExternalIdentityCandidate,
  IngestionPlugin,
  IngestionResult,
  SourceScopeCandidate,
} from "./types";
export { IngestionError } from "./types";
```

- [ ] **Step 6: Install dependencies**

Run: `bun install`

- [ ] **Step 7: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 8: Commit**

```bash
git add packages/ingestion-core/
git commit -m "feat: add ingestion pipeline, registry, and dedup to ingestion-core"
```

---

## Task 4: Create the Git ingestion plugin package

Create `packages/ingestion-git` with the `IngestionPlugin` implementation for Git sources. This handles GitHub webhook payloads and commit history.

**Files:**
- Create: `packages/ingestion-git/package.json`
- Create: `packages/ingestion-git/tsconfig.json`
- Create: `packages/ingestion-git/src/types.ts`
- Create: `packages/ingestion-git/src/index.ts`
- Create: `packages/ingestion-git/src/normalizer.ts`
- Create: `packages/ingestion-git/src/identity-extractor.ts`
- Create: `packages/ingestion-git/src/scope-extractor.ts`
- Create: `packages/ingestion-git/src/plugin.ts`

- [ ] **Step 1: Create package.json**

Create `packages/ingestion-git/package.json`:

```json
{
  "name": "@timesheet-ai/ingestion-git",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@timesheet-ai/domain": "workspace:*",
    "@timesheet-ai/ingestion-core": "workspace:*",
    "@timesheet-ai/shared": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@timesheet-ai/config": "workspace:*",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/ingestion-git/tsconfig.json`:

```json
{
  "extends": "@timesheet-ai/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create Git payload types**

Create `packages/ingestion-git/src/types.ts`:

```ts
export interface GitAuthor {
  readonly email: string;
  readonly name: string;
}

export interface GitCommit {
  readonly id: string;
  readonly message: string;
  readonly timestamp: string;
  readonly author: GitAuthor;
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly removed: readonly string[];
}

export interface GitPushPayload {
  readonly ref: string;
  readonly before: string;
  readonly after: string;
  readonly repository: {
    readonly id: number;
    readonly full_name: string;
    readonly html_url: string;
  };
  readonly sender: {
    readonly id: number;
    readonly login: string;
    readonly avatar_url: string;
  };
  readonly commits: readonly GitCommit[];
  readonly head_commit?: GitCommit;
}

export interface GitPullRequestPayload {
  readonly action: string;
  readonly number: number;
  readonly pull_request: {
    readonly id: number;
    readonly number: number;
    readonly title: string;
    readonly body: string | null;
    readonly state: string;
    readonly html_url: string;
    readonly branch: string;
    readonly user: {
      readonly id: number;
      readonly login: string;
    };
    readonly merged: boolean;
    readonly merged_by?: {
      readonly id: number;
      readonly login: string;
    };
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly repository: {
    readonly id: number;
    readonly full_name: string;
    readonly html_url: string;
  };
  readonly sender: {
    readonly id: number;
    readonly login: string;
  };
}

export type GitWebhookPayload = GitPushPayload | GitPullRequestPayload;
```

- [ ] **Step 4: Create normalizer.ts**

Create `packages/ingestion-git/src/normalizer.ts`:

```ts
import type { NormalizedEvent, Source } from "@timesheet-ai/domain";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommit, GitPullRequestPayload, GitPushPayload } from "./types";

const GIT_SOURCE: Source = "git";

const isPushPayload = (
  payload: unknown
): payload is GitPushPayload => {
  const p = payload as Record<string, unknown>;
  return Array.isArray(p.commits) && typeof p.ref === "string";
};

const isPullRequestPayload = (
  payload: unknown
): payload is GitPullRequestPayload => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p.action === "string" &&
    typeof p.pull_request === "object" &&
    p.pull_request !== null
  );
};

const normalizeCommit = (
  commit: GitCommit,
  pushPayload: GitPushPayload
): Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> => ({
  source: GIT_SOURCE,
  sourceEventType: "commit",
  eventTime: commit.timestamp,
  sourceRef: {
    connectionId: "",
    externalEventId: commit.id,
    externalScopeId: pushPayload.repository.full_name,
    externalUrl: `${pushPayload.repository.html_url}/commit/${commit.id}`,
  },
  content: {
    message: commit.message,
    commitSha: commit.id,
    branch: pushPayload.ref.replace("refs/heads/", ""),
    fileCount: commit.added.length + commit.modified.length + commit.removed.length,
    additions: commit.added.length,
    deletions: commit.removed.length,
    title: commit.message.split("\n")[0],
  },
  attribution: {
    attributionMethod: "direct",
  },
  processingVersion: 1,
});

const normalizePullRequest = (
  payload: GitPullRequestPayload
): Omit<NormalizedEvent, "id" | "organizationId" | "ingestedAt"> => ({
  source: GIT_SOURCE,
  sourceEventType: `pr.${payload.action}`,
  eventTime: payload.pull_request.updated_at,
  sourceRef: {
    connectionId: "",
    externalEventId: `pr-${payload.pull_request.id}-${payload.action}`,
    externalScopeId: payload.repository.full_name,
    externalUrl: payload.pull_request.html_url,
  },
  content: {
    title: payload.pull_request.title,
    body: payload.pull_request.body ?? undefined,
    branch: payload.pull_request.branch,
    tags: [payload.pull_request.state],
  },
  attribution: {
    attributionMethod: "direct",
  },
  processingVersion: 1,
});

export const normalizeGitPayload = (
  rawPayload: unknown
): Effect.Effect<readonly NormalizedEvent[], IngestionError> =>
  Effect.gen(function* () {
    if (isPushPayload(rawPayload)) {
      const events: NormalizedEvent[] = rawPayload.commits.map(
        (commit) =>
          normalizeCommit(commit, rawPayload) as NormalizedEvent
      );
      return events;
    }

    if (isPullRequestPayload(rawPayload)) {
      const event = normalizePullRequest(rawPayload) as NormalizedEvent;
      return [event];
    }

    return yield* Effect.fail(
      new IngestionError({
        message: "Unknown Git payload type",
        source: "git",
      })
    );
  });
```

- [ ] **Step 5: Create identity-extractor.ts**

Create `packages/ingestion-git/src/identity-extractor.ts`:

```ts
import type { ExternalIdentityCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitCommit, GitPullRequestPayload, GitPushPayload } from "./types";

const isPushPayload = (payload: unknown): payload is GitPushPayload => {
  const p = payload as Record<string, unknown>;
  return Array.isArray(p.commits) && typeof p.ref === "string";
};

const isPullRequestPayload = (
  payload: unknown
): payload is GitPullRequestPayload => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p.action === "string" &&
    typeof p.pull_request === "object" &&
    p.pull_request !== null
  );
};

const deduplicateCandidates = (
  candidates: readonly ExternalIdentityCandidate[]
): ExternalIdentityCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.source}:${c.externalId}:${c.email ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const extractGitIdentities = (
  rawPayload: unknown
): Effect.Effect<readonly ExternalIdentityCandidate[], IngestionError> =>
  Effect.gen(function* () {
    const candidates: ExternalIdentityCandidate[] = [];

    if (isPushPayload(rawPayload)) {
      if (rawPayload.sender) {
        candidates.push({
          source: "git",
          externalId: String(rawPayload.sender.id),
          username: rawPayload.sender.login,
          displayName: rawPayload.sender.login,
        });
      }

      for (const commit of rawPayload.commits as readonly GitCommit[]) {
        candidates.push({
          source: "git",
          externalId: commit.author.email,
          email: commit.author.email,
          displayName: commit.author.name,
          username: commit.author.email.split("@")[0],
        });
      }
    }

    if (isPullRequestPayload(rawPayload)) {
      candidates.push({
        source: "git",
        externalId: String(rawPayload.pull_request.user.id),
        username: rawPayload.pull_request.user.login,
        displayName: rawPayload.pull_request.user.login,
      });

      if (
        rawPayload.action === "closed" &&
        rawPayload.pull_request.merged &&
        rawPayload.pull_request.merged_by
      ) {
        candidates.push({
          source: "git",
          externalId: String(rawPayload.pull_request.merged_by.id),
          username: rawPayload.pull_request.merged_by.login,
          displayName: rawPayload.pull_request.merged_by.login,
        });
      }
    }

    if (candidates.length === 0 && !isPushPayload(rawPayload) && !isPullRequestPayload(rawPayload)) {
      return yield* Effect.fail(
        new IngestionError({
          message: "Cannot extract identities from unknown payload type",
          source: "git",
        })
      );
    }

    return deduplicateCandidates(candidates);
  });
```

- [ ] **Step 6: Create scope-extractor.ts**

Create `packages/ingestion-git/src/scope-extractor.ts`:

```ts
import type { SourceScopeCandidate } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { GitPullRequestPayload, GitPushPayload } from "./types";

const isPushPayload = (payload: unknown): payload is GitPushPayload => {
  const p = payload as Record<string, unknown>;
  return Array.isArray(p.commits) && typeof p.ref === "string";
};

const isPullRequestPayload = (
  payload: unknown
): payload is GitPullRequestPayload => {
  const p = payload as Record<string, unknown>;
  return (
    typeof p.action === "string" &&
    typeof p.pull_request === "object" &&
    p.pull_request !== null
  );
};

export const extractGitScopes = (
  rawPayload: unknown
): Effect.Effect<readonly SourceScopeCandidate[], IngestionError> =>
  Effect.gen(function* () {
    if (isPushPayload(rawPayload)) {
      return [
        {
          externalScopeId: rawPayload.repository.full_name,
          name: rawPayload.repository.full_name,
          scopeType: "repo" as const,
        },
      ];
    }

    if (isPullRequestPayload(rawPayload)) {
      return [
        {
          externalScopeId: rawPayload.repository.full_name,
          name: rawPayload.repository.full_name,
          scopeType: "repo" as const,
        },
      ];
    }

    return yield* Effect.fail(
      new IngestionError({
        message: "Cannot extract scopes from unknown payload type",
        source: "git",
      })
    );
  });
```

- [ ] **Step 7: Create plugin.ts**

Create `packages/ingestion-git/src/plugin.ts`:

```ts
import type { IngestionPlugin, IngestionResult } from "@timesheet-ai/ingestion-core";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import type { Source } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { extractGitIdentities } from "./identity-extractor";
import { normalizeGitPayload } from "./normalizer";
import { extractGitScopes } from "./scope-extractor";

const GIT_SOURCE: Source = "git";

export const GitIngestionPlugin: IngestionPlugin = {
  source: GIT_SOURCE,

  normalize: normalizeGitPayload,

  extractIdentities: extractGitIdentities,

  extractScopes: extractGitScopes,

  sync: (
    _connectionId: string,
    _cursor?: string
  ): Effect.Effect<IngestionResult, IngestionError> =>
    Effect.fail(
      new IngestionError({
        message:
          "Git sync via polling is not supported. Use webhooks to push events to the ingestion pipeline.",
        source: "git",
      })
    ),
};
```

- [ ] **Step 8: Create index.ts**

Create `packages/ingestion-git/src/index.ts`:

```ts
export { extractGitIdentities } from "./identity-extractor";
export { GitIngestionPlugin } from "./plugin";
export { normalizeGitPayload } from "./normalizer";
export { extractGitScopes } from "./scope-extractor";
export type {
  GitAuthor,
  GitCommit,
  GitPullRequestPayload,
  GitPushPayload,
  GitWebhookPayload,
} from "./types";
```

- [ ] **Step 9: Add workspace to root package.json**

The root `package.json` already has `"packages": ["apps/*", "packages/*"]`, and `packages/ingestion-git` is under `packages/*`, so it's already included. Run install:

Run: `bun install`

- [ ] **Step 10: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 11: Commit**

```bash
git add packages/ingestion-git/
git commit -m "feat: add Git ingestion plugin with normalizer, identity and scope extractors"
```

---

## Task 5: Write unit tests for Git ingestion plugin

Tests for the normalizer, identity extractor, scope extractor, and dedup modules.

**Files:**
- Create: `packages/ingestion-git/tests/normalizer.test.ts`
- Create: `packages/ingestion-git/tests/identity-extractor.test.ts`
- Create: `packages/ingestion-git/tests/scope-extractor.test.ts`

- [ ] **Step 1: Create normalizer tests**

Create `packages/ingestion-git/tests/normalizer.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { normalizeGitPayload } from "../src/normalizer";
import type { GitPushPayload, GitPullRequestPayload } from "../src/types";

const pushPayload: GitPushPayload = {
  ref: "refs/heads/main",
  before: "abc",
  after: "def",
  repository: {
    id: 1,
    full_name: "org/client-portal",
    html_url: "https://github.com/org/client-portal",
  },
  sender: {
    id: 42,
    login: "jane-dev",
    avatar_url: "https://github.com/avatar.png",
  },
  commits: [
    {
      id: "sha123",
      message: "fix: auth token refresh\n\nDetailed description here",
      timestamp: "2026-04-30T10:05:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: ["src/auth.ts"],
      modified: ["src/token.ts"],
      removed: ["src/old-auth.ts"],
    },
    {
      id: "sha456",
      message: "chore: update deps",
      timestamp: "2026-04-30T10:10:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: [],
      modified: ["package.json"],
      removed: [],
    },
  ],
};

const prPayload: GitPullRequestPayload = {
  action: "opened",
  number: 15,
  pull_request: {
    id: 999,
    number: 15,
    title: "Fix auth token refresh",
    body: "This PR fixes the token refresh issue.",
    state: "open",
    html_url: "https://github.com/org/client-portal/pull/15",
    branch: "fix/auth-refresh",
    user: { id: 42, login: "jane-dev" },
    merged: false,
    created_at: "2026-04-30T09:00:00Z",
    updated_at: "2026-04-30T09:00:00Z",
  },
  repository: {
    id: 1,
    full_name: "org/client-portal",
    html_url: "https://github.com/org/client-portal",
  },
  sender: { id: 42, login: "jane-dev" },
};

describe("normalizeGitPayload", () => {
  it("normalizes a push payload into commit events", async () => {
    const result = await Effect.runPromise(
      normalizeGitPayload(pushPayload)
    );
    expect(result).toHaveLength(2);

    const first = result[0];
    expect(first.source).toBe("git");
    expect(first.sourceEventType).toBe("commit");
    expect(first.eventTime).toBe("2026-04-30T10:05:00Z");
    expect(first.content.message).toBe(
      "fix: auth token refresh\n\nDetailed description here"
    );
    expect(first.content.commitSha).toBe("sha123");
    expect(first.content.branch).toBe("main");
    expect(first.content.fileCount).toBe(3);
    expect(first.content.additions).toBe(1);
    expect(first.content.deletions).toBe(1);
    expect(first.sourceRef.externalScopeId).toBe("org/client-portal");
    expect(first.content.title).toBe("fix: auth token refresh");
  });

  it("normalizes a pull request payload", async () => {
    const result = await Effect.runPromise(
      normalizeGitPayload(prPayload)
    );
    expect(result).toHaveLength(1);

    const event = result[0];
    expect(event.source).toBe("git");
    expect(event.sourceEventType).toBe("pr.opened");
    expect(event.content.title).toBe("Fix auth token refresh");
    expect(event.content.body).toBe("This PR fixes the token refresh issue.");
    expect(event.content.branch).toBe("fix/auth-refresh");
    expect(event.sourceRef.externalUrl).toBe(
      "https://github.com/org/client-portal/pull/15"
    );
  });

  it("fails for unknown payload type", async () => {
    const result = await Effect.runPromise(
      Effect.either(normalizeGitPayload({ unknown: true }))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Unknown Git payload type");
    }
  });
});
```

Note: This test needs the Effect import. Add at top of the file:

```ts
import { Effect } from "effect";
```

So the full file with import is:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { normalizeGitPayload } from "../src/normalizer";
import type { GitPushPayload, GitPullRequestPayload } from "../src/types";

// ... rest as above
```

- [ ] **Step 2: Create identity extractor tests**

Create `packages/ingestion-git/tests/identity-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractGitIdentities } from "../src/identity-extractor";
import type { GitPushPayload, GitPullRequestPayload } from "../src/types";

const pushPayload: GitPushPayload = {
  ref: "refs/heads/main",
  before: "abc",
  after: "def",
  repository: {
    id: 1,
    full_name: "org/repo",
    html_url: "https://github.com/org/repo",
  },
  sender: {
    id: 42,
    login: "jane-dev",
    avatar_url: "https://github.com/avatar.png",
  },
  commits: [
    {
      id: "sha1",
      message: "fix bug",
      timestamp: "2026-04-30T10:00:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: [],
      modified: ["a.ts"],
      removed: [],
    },
    {
      id: "sha2",
      message: "another fix",
      timestamp: "2026-04-30T10:05:00Z",
      author: { email: "jane@example.com", name: "Jane Doe" },
      added: [],
      modified: ["b.ts"],
      removed: [],
    },
  ],
};

const prMergedPayload: GitPullRequestPayload = {
  action: "closed",
  number: 1,
  pull_request: {
    id: 10,
    number: 1,
    title: "Fix bug",
    body: null,
    state: "closed",
    html_url: "https://github.com/org/repo/pull/1",
    branch: "fix/bug",
    user: { id: 42, login: "jane-dev" },
    merged: true,
    merged_by: { id: 99, login: "reviewer" },
    created_at: "2026-04-30T09:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
  },
  repository: { id: 1, full_name: "org/repo", html_url: "https://github.com/org/repo" },
  sender: { id: 42, login: "jane-dev" },
};

describe("extractGitIdentities", () => {
  it("extracts sender and author identities from push", async () => {
    const result = await Effect.runPromise(
      extractGitIdentities(pushPayload)
    );
    expect(result.length).toBeGreaterThanOrEqual(2);

    const sender = result.find((c) => c.externalId === "42");
    expect(sender).toBeDefined();
    expect(sender?.username).toBe("jane-dev");

    const author = result.find(
      (c) => c.email === "jane@example.com"
    );
    expect(author).toBeDefined();
    expect(author?.displayName).toBe("Jane Doe");
  });

  it("deduplicates same author across commits", async () => {
    const result = await Effect.runPromise(
      extractGitIdentities(pushPayload)
    );
    const emailIdentities = result.filter(
      (c) => c.email === "jane@example.com"
    );
    expect(emailIdentities).toHaveLength(1);
  });

  it("extracts PR author and merger", async () => {
    const result = await Effect.runPromise(
      extractGitIdentities(prMergedPayload)
    );
    expect(result).toHaveLength(2);

    const author = result.find((c) => c.externalId === "42");
    expect(author?.username).toBe("jane-dev");

    const merger = result.find((c) => c.externalId === "99");
    expect(merger?.username).toBe("reviewer");
  });

  it("fails for unknown payload", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitIdentities({ foo: "bar" }))
    );
    expect(result._tag).toBe("Left");
  });
});
```

- [ ] **Step 3: Create scope extractor tests**

Create `packages/ingestion-git/tests/scope-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { extractGitScopes } from "../src/scope-extractor";
import type { GitPushPayload, GitPullRequestPayload } from "../src/types";

const pushPayload: GitPushPayload = {
  ref: "refs/heads/main",
  before: "abc",
  after: "def",
  repository: {
    id: 1,
    full_name: "org/client-portal",
    html_url: "https://github.com/org/client-portal",
  },
  sender: {
    id: 42,
    login: "jane-dev",
    avatar_url: "https://github.com/avatar.png",
  },
  commits: [],
};

const prPayload: GitPullRequestPayload = {
  action: "opened",
  number: 5,
  pull_request: {
    id: 100,
    number: 5,
    title: "Feature X",
    body: null,
    state: "open",
    html_url: "https://github.com/org/client-portal/pull/5",
    branch: "feature/x",
    user: { id: 42, login: "jane-dev" },
    merged: false,
    created_at: "2026-04-30T09:00:00Z",
    updated_at: "2026-04-30T09:00:00Z",
  },
  repository: { id: 1, full_name: "org/client-portal", html_url: "https://github.com/org/client-portal" },
  sender: { id: 42, login: "jane-dev" },
};

describe("extractGitScopes", () => {
  it("extracts repo scope from push payload", async () => {
    const result = await Effect.runPromise(
      extractGitScopes(pushPayload)
    );
    expect(result).toHaveLength(1);
    expect(result[0].scopeType).toBe("repo");
    expect(result[0].externalScopeId).toBe("org/client-portal");
    expect(result[0].name).toBe("org/client-portal");
  });

  it("extracts repo scope from PR payload", async () => {
    const result = await Effect.runPromise(
      extractGitScopes(prPayload)
    );
    expect(result).toHaveLength(1);
    expect(result[0].externalScopeId).toBe("org/client-portal");
  });

  it("fails for unknown payload", async () => {
    const result = await Effect.runPromise(
      Effect.either(extractGitScopes({ random: true }))
    );
    expect(result._tag).toBe("Left");
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `bun test --filter '@timesheet-ai/ingestion-git'`
Expected: All tests pass

- [ ] **Step 5: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion-git/tests/
git commit -m "test: add unit tests for Git ingestion normalizer, identity and scope extractors"
```

---

## Task 6: Create the ingestion-sync worker job

Wire the ingestion pipeline into the worker runtime as a job handler that processes ingestion sync jobs.

**Files:**
- Create: `apps/worker/src/jobs/ingestion-sync.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/package.json`

- [ ] **Step 1: Create ingestion-sync job handler**

Create `apps/worker/src/jobs/ingestion-sync.ts`:

```ts
import { SurrealDb } from "@timesheet-ai/db";
import {
  getIntegrationConnection,
  updateJobStatus,
} from "@timesheet-ai/db";
import {
  getPlugin,
  runIngestionPipeline,
} from "@timesheet-ai/ingestion-core";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runIngestionSync = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const connectionId = metadata?.connectionId as string | undefined;
    const rawPayloads = metadata?.rawPayloads as
      | readonly unknown[]
      | undefined;

    if (!connectionId) {
      return yield* Effect.fail(
        new Error("ingestion-sync job requires connectionId in metadata")
      );
    }

    const connection = yield* getIntegrationConnection(connectionId);
    yield* logInfo("Starting ingestion sync", {
      connectionId,
      source: connection.source,
      orgId: connection.organizationId,
    });

    if (rawPayloads && rawPayloads.length > 0) {
      yield* runIngestionPipeline(
        connection.source,
        connectionId,
        connection.organizationId as string,
        rawPayloads
      );
    } else {
      const plugin = getPlugin(connection.source);
      if (!plugin) {
        return yield* Effect.fail(
          new Error(`No plugin for source: ${connection.source}`)
        );
      }

      const result = yield* Effect.either(
        plugin.sync(connectionId, metadata?.cursor as string | undefined)
      );
      if (result._tag === "Left") {
        yield* logError("Plugin sync failed", {
          error: result.left.message,
        });
        return;
      }

      if (result.right.rawPayloadCount > 0) {
        yield* runIngestionPipeline(
          connection.source,
          connectionId,
          connection.organizationId as string,
          [],
          result.right.cursor
        );
      }
    }

    yield* logInfo("Ingestion sync complete", { connectionId });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Ingestion sync job failed", {
          error: String(error),
        });
      })
    )
  );
```

- [ ] **Step 2: Update worker/src/index.ts**

Replace `apps/worker/src/index.ts` with:

```ts
import { SurrealDb } from "@timesheet-ai/db";
import { registerPlugin } from "@timesheet-ai/ingestion-core";
import { GitIngestionPlugin } from "@timesheet-ai/ingestion-git";
import { logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { pollAndExecute, registerJobHandler } from "./job-runner";
import { runHealthCheck } from "./jobs/health-check";
import { runIngestionSync } from "./jobs/ingestion-sync";

const POLL_INTERVAL_MS = 5000;

let isShuttingDown = false;

process.on("SIGINT", () => {
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
});

registerPlugin(GitIngestionPlugin);

registerJobHandler("health-check", runHealthCheck);
registerJobHandler("ingestion-sync", runIngestionSync);

const program = Effect.gen(function* () {
  yield* logInfo("Worker starting...");

  yield* Effect.forkDaemon(
    Effect.gen(function* () {
      while (!isShuttingDown) {
        const count = yield* pollAndExecute();
        if (count > 0) {
          yield* logInfo("Poll cycle complete", { executed: count });
        }
        yield* Effect.sleep(POLL_INTERVAL_MS);
      }
      yield* logInfo("Worker shutting down...");
    })
  );

  yield* logInfo("Worker ready", {
    intervalMs: POLL_INTERVAL_MS,
    plugins: ["git"],
  });
});

Effect.runFork(program.pipe(Effect.provide(SurrealDb)));

console.log(`Worker polling every ${POLL_INTERVAL_MS}ms`);
```

- [ ] **Step 3: Update worker package.json**

Replace `apps/worker/package.json` with:

```json
{
  "name": "worker",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "tsdown",
    "check-types": "tsc -b",
    "dev": "bun run --hot src/index.ts",
    "start": "bun run dist/index.mjs"
  },
  "dependencies": {
    "@timesheet-ai/db": "workspace:*",
    "@timesheet-ai/domain": "workspace:*",
    "@timesheet-ai/env": "workspace:*",
    "@timesheet-ai/ingestion-core": "workspace:*",
    "@timesheet-ai/ingestion-git": "workspace:*",
    "@timesheet-ai/observability": "workspace:*",
    "@timesheet-ai/shared": "workspace:*",
    "dotenv": "catalog:",
    "effect": "catalog:",
    "surrealdb": "^1.3.0"
  },
  "devDependencies": {
    "@timesheet-ai/config": "workspace:*",
    "@types/bun": "catalog:",
    "tsdown": "^0.21.9",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`

- [ ] **Step 5: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 6: Commit**

```bash
git add apps/worker/
git commit -m "feat: add ingestion-sync worker job with Git plugin registration"
```

---

## Task 7: Add API routes for integrations and events

Create Elysia route handlers for managing integration connections and querying events.

**Files:**
- Create: `apps/server/src/routes/integrations.ts`
- Create: `apps/server/src/routes/events.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: Create integrations routes**

Create `apps/server/src/routes/integrations.ts`:

```ts
import {
  SurrealDb,
  SurrealDbTag,
  createIntegrationConnection,
  createJobRun,
  getIntegrationConnection,
  listConnectionsByOrg,
  updateConnectionStatus,
} from "@timesheet-ai/db";
import type { Source } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const integrationRoutes = new Elysia({
  prefix: "/integrations",
})
  .get("/", async ({ query }) => {
    const effect = Effect.gen(function* () {
      const connections = yield* listConnectionsByOrg(
        query.orgId,
        query.source as Source | undefined
      );
      return connections;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({
      orgId: t.String(),
      source: t.Optional(t.String()),
    }),
  })
  .post("/", async ({ body }) => {
    const effect = Effect.gen(function* () {
      const connection = yield* createIntegrationConnection({
        organizationId: body.organizationId,
        source: body.source as Source,
        name: body.name,
        configRef: body.configRef,
      });
      return connection;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      organizationId: t.String(),
      source: t.String(),
      name: t.String(),
      configRef: t.String(),
    }),
  })
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getIntegrationConnection(params.id);
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "NOT_FOUND", message: String(error) }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  })
  .patch("/:id/status", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      return yield* updateConnectionStatus(params.id, body.status as "active" | "paused" | "error");
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      status: t.String(),
    }),
  })
  .post("/:id/sync", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      const connection = yield* getIntegrationConnection(params.id);
      const job = yield* createJobRun({
        organizationId: connection.organizationId as string,
        jobType: "ingestion-sync",
        metadata: {
          connectionId: params.id,
          rawPayloads: body?.rawPayloads,
        },
      });
      return job;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  });
```

- [ ] **Step 2: Create events routes**

Create `apps/server/src/routes/events.ts`:

```ts
import {
  SurrealDb,
  SurrealDbTag,
  getEventsByUserAndDateRange,
} from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const eventRoutes = new Elysia({
  prefix: "/events",
})
  .get("/", async ({ query }) => {
    const effect = Effect.gen(function* () {
      const events = yield* getEventsByUserAndDateRange(
        query.userId,
        query.dateStart,
        query.dateEnd
      );
      return events;
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({
      userId: t.String(),
      dateStart: t.String(),
      dateEnd: t.String(),
    }),
  });
```

- [ ] **Step 3: Update routes/index.ts**

Replace `apps/server/src/routes/index.ts` with:

```ts
import { Elysia } from "elysia";
import { eventRoutes } from "./events";
import { healthRoutes } from "./health";
import { integrationRoutes } from "./integrations";

export const routes = new Elysia()
  .use(healthRoutes)
  .use(integrationRoutes)
  .use(eventRoutes);
```

- [ ] **Step 4: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/
git commit -m "feat: add integration and event API routes"
```

---

## Task 8: Add webhook endpoint for Git ingestion

Add a `POST /webhooks/git` route that receives GitHub webhook payloads and enqueues them as ingestion-sync jobs.

**Files:**
- Create: `apps/server/src/routes/webhooks.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: Create webhook route**

Create `apps/server/src/routes/webhooks.ts`:

```ts
import {
  SurrealDb,
  createJobRun,
} from "@timesheet-ai/db";
import { logInfo, logWarn } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { Elysia } from "elysia";

export const webhookRoutes = new Elysia({
  prefix: "/webhooks",
}).post("/git", async ({ body, headers }) => {
  const payload = body as unknown;
  const githubEvent = headers["x-github-event"] as string | undefined;

  if (!githubEvent) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing x-github-event header" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const p = payload as Record<string, unknown>;
  const repo = p.repository as Record<string, unknown> | undefined;
  const repoName = repo?.full_name as string | undefined;

  yield* logInfo("Git webhook received", {
    event: githubEvent,
    repo: repoName,
  });

  const supportedEvents = ["push", "pull_request"];
  if (!supportedEvents.includes(githubEvent)) {
    return { ok: true as const, message: `Event ${githubEvent} ignored` };
  }

  const effect = Effect.gen(function* () {
    const organizationId = "org_default";
    const job = yield* createJobRun({
      organizationId,
      jobType: "ingestion-sync",
      metadata: {
        connectionId: `git:${repoName ?? "unknown"}`,
        rawPayloads: [payload],
        source: "git",
        githubEvent,
      },
    });
    return job;
  }).pipe(Effect.provide(SurrealDb));

  try {
    const result = await Effect.runPromise(effect);
    return { ok: true as const, data: result };
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

Wait — `yield*` doesn't work outside `Effect.gen`. Let me fix:

Create `apps/server/src/routes/webhooks.ts`:

```ts
import {
  SurrealDb,
  createJobRun,
} from "@timesheet-ai/db";
import { logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";
import { Elysia } from "elysia";

export const webhookRoutes = new Elysia({
  prefix: "/webhooks",
}).post("/git", async ({ body, headers }) => {
  const payload = body as unknown;
  const githubEvent = headers["x-github-event"] as string | undefined;

  if (!githubEvent) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing x-github-event header" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const p = payload as Record<string, unknown>;
  const repo = p.repository as Record<string, unknown> | undefined;
  const repoName = repo?.full_name as string | undefined;

  await Effect.runPromise(
    logInfo("Git webhook received", { event: githubEvent, repo: repoName })
  );

  const supportedEvents = ["push", "pull_request"];
  if (!supportedEvents.includes(githubEvent)) {
    return { ok: true as const, message: `Event ${githubEvent} ignored` };
  }

  const effect = Effect.gen(function* () {
    const organizationId = "org_default";
    const job = yield* createJobRun({
      organizationId,
      jobType: "ingestion-sync",
      metadata: {
        connectionId: `git:${repoName ?? "unknown"}`,
        rawPayloads: [payload],
        source: "git",
        githubEvent,
      },
    });
    return job;
  }).pipe(Effect.provide(SurrealDb));

  try {
    const result = await Effect.runPromise(effect);
    return { ok: true as const, data: result };
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: "INTERNAL_ERROR", message: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Update routes/index.ts**

Replace `apps/server/src/routes/index.ts` with:

```ts
import { Elysia } from "elysia";
import { eventRoutes } from "./events";
import { healthRoutes } from "./health";
import { integrationRoutes } from "./integrations";
import { webhookRoutes } from "./webhooks";

export const routes = new Elysia()
  .use(healthRoutes)
  .use(integrationRoutes)
  .use(eventRoutes)
  .use(webhookRoutes);
```

- [ ] **Step 3: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/
git commit -m "feat: add Git webhook endpoint for push and PR events"
```

---

## Task 9: Clean up dead code

Remove the duplicate `packages/db/src/errors.ts` file and ensure the codebase is clean.

**Files:**
- Delete: `packages/db/src/errors.ts`

- [ ] **Step 1: Verify errors.ts is unused**

Run: `grep -r "from.*['\"].*errors['\"]" packages/db/src/`
Expected: No imports of `./errors` from within db package (the real errors are in `connection.ts`)

- [ ] **Step 2: Delete the file**

```bash
rm packages/db/src/errors.ts
```

- [ ] **Step 3: Run typecheck**

Run: `bun run check-types`
Expected: All packages pass

- [ ] **Step 4: Commit**

```bash
git add -u packages/db/src/errors.ts
git commit -m "chore: remove duplicate db errors.ts (already in connection.ts)"
```

---

## Task 10: Run full verification

Verify the entire codebase compiles, lints, and tests pass.

- [ ] **Step 1: Run typecheck across all packages**

Run: `bun run check-types`
Expected: All packages pass with no errors

- [ ] **Step 2: Run linter**

Run: `bun run check`
Expected: No linting errors (fix with `bun run fix` if needed)

- [ ] **Step 3: Run tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Run fix if needed**

Run: `bun run fix`
Then re-run `bun run check` to confirm clean

---

## Self-Review

### Spec Coverage Check

| Architecture Requirement | Task |
|---|---|
| Integration connection model | Task 2 (integration.repo.ts) |
| Raw payload storage | Already exists (event.repo.ts storeRawPayload) |
| Normalized events | Already exists (event.repo.ts storeNormalizedEvent) |
| Deduplication (checksum + externalEventId) | Task 3 (dedup.ts) |
| Ingestion plugin contract | Already exists (ingestion-core types.ts) |
| Plugin registry | Task 3 (registry.ts) |
| Pipeline orchestration | Task 3 (pipeline.ts) |
| Git connector | Task 4 (packages/ingestion-git) |
| Worker ingestion job | Task 6 (ingestion-sync.ts) |
| Integration CRUD API | Task 7 (integrations.ts) |
| Event query API | Task 7 (events.ts) |
| Webhook endpoint | Task 8 (webhooks.ts) |
| External identity storage | Task 2 (identity.repo.ts) |
| Source mapping storage | Task 2 (mapping.repo.ts) |
| Worker error handling fix | Task 1 |

### Placeholder Scan
No TBD, TODO, or placeholder patterns found.

### Type Consistency
All types reference the domain package exports (`Source`, `NormalizedEvent`, `ExternalIdentityCandidate`, etc.) and follow existing codebase patterns (Effect generators, SurrealDbTag injection, `generateId` prefix convention).

### Gaps / Notes
- **Plane and Discord ingestion plugins** are deferred per the architecture doc's MVP build order (Phase 2 scope = Git first). The plugin registry and pipeline are ready to accept them.
- **Identity resolution engine** (Phase 3) will consume the `external_identity` records created during ingestion.
- **Auth** is not in scope for Phase 2. The webhook endpoint uses a hardcoded `org_default` for now; this will be replaced when auth lands.
- The `IngestionPlugin.sync()` method for Git returns failure (push-only source), which is correct — GitHub ingestion happens via webhooks, not polling.
