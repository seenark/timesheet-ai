import {
  listUnmatchedIdentities,
  listUsersByOrg,
  SurrealDb,
  setIdentitiesStatus,
} from "@timesheet-ai/db";
import {
  type IdentityCandidate,
  resolveIdentity,
} from "@timesheet-ai/identity";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runIdentityResolve = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = metadata?.organizationId as string | undefined;
    if (!organizationId) {
      return yield* Effect.fail(
        new Error("identity-resolve job requires organizationId in metadata")
      );
    }

    yield* logInfo("Starting identity resolution", { organizationId });

    const [identities, canonicalUsers] = yield* Effect.all([
      listUnmatchedIdentities(organizationId),
      listUsersByOrg(organizationId),
    ]);

    yield* logInfo("Loaded identities and users", {
      identityCount: identities.length,
      userCount: canonicalUsers.length,
      organizationId,
    });

    const toAutoLink: string[] = [];
    const toSuggest: string[] = [];

    for (const identity of identities) {
      const candidate: IdentityCandidate = {
        externalId: identity.externalId,
        organizationId: identity.organizationId as string,
        source: identity.source,
        email: identity.email,
        username: identity.username,
        displayName: identity.displayName,
      };

      const result = resolveIdentity(candidate, canonicalUsers, []);

      if (result.action === "auto-link" && result.canonicalUserId) {
        toAutoLink.push(identity.id);
      } else if (result.action === "suggest" && result.canonicalUserId) {
        toSuggest.push(identity.id);
      }
    }

    if (toAutoLink.length > 0) {
      yield* setIdentitiesStatus(toAutoLink, "matched");
      yield* logInfo("Auto-linked identities", { count: toAutoLink.length });
    }

    if (toSuggest.length > 0) {
      yield* setIdentitiesStatus(toSuggest, "suggested");
      yield* logInfo("Suggested identities", { count: toSuggest.length });
    }

    yield* logInfo("Identity resolution complete", {
      autoLinked: toAutoLink.length,
      suggested: toSuggest.length,
      unmatched: identities.length - toAutoLink.length - toSuggest.length,
      organizationId,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Identity resolve job failed", {
          error: String(error),
        });
      }).pipe(Effect.provide(SurrealDb))
    )
  );
