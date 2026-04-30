import { attributeEvent } from "@timesheet-ai/attribution";
import {
  enrichEvent,
  listEventsForEnrichment,
  SurrealDb,
} from "@timesheet-ai/db";
import type { NormalizedEvent } from "@timesheet-ai/domain";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runEventEnrichment = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = metadata?.organizationId as string | undefined;
    if (!organizationId) {
      return yield* Effect.fail(
        new Error("event-enrichment job requires organizationId in metadata")
      );
    }

    yield* logInfo("Starting event enrichment", { organizationId });

    const events = yield* listEventsForEnrichment(organizationId);
    yield* logInfo("Events requiring enrichment", {
      count: events.length,
      organizationId,
    });

    let enriched = 0;
    for (const event of events) {
      const result = attributeEvent(
        event as unknown as NormalizedEvent,
        [],
        []
      );

      if (result.attributionMethod !== "manual" || result.projectId) {
        yield* enrichEvent({
          eventId: event.id as string,
          canonicalUserId: result.canonicalUserId,
          projectId: result.projectId,
          attributionMethod: result.attributionMethod,
          identityConfidence: result.identityConfidence,
          projectConfidence: result.projectConfidence,
          ruleId: result.ruleId,
        });
        enriched++;
      }
    }

    yield* logInfo("Event enrichment complete", {
      enriched,
      total: events.length,
      organizationId,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Event enrichment job failed", {
          error: String(error),
        });
      }).pipe(Effect.provide(SurrealDb))
    )
  );
