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
