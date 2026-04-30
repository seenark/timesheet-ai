import { getIntegrationConnection, SurrealDb } from "@timesheet-ai/db";
import { getPlugin, runIngestionPipeline } from "@timesheet-ai/ingestion-core";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runIngestionSync = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const connectionId = metadata?.connectionId as string | undefined;
    const rawPayloads = metadata?.rawPayloads as readonly unknown[] | undefined;

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
      }).pipe(Effect.provide(SurrealDb))
    )
  );
