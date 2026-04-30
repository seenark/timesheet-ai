import type { ISurrealDb } from "@timesheet-ai/db";
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
): Effect.Effect<boolean, never, ISurrealDb> =>
  Effect.gen(function* () {
    const { SurrealDbTag } = yield* Effect.promise(() =>
      import("@timesheet-ai/db").then((m) => ({ SurrealDbTag: m.SurrealDbTag }))
    );
    const db = yield* SurrealDbTag;
    const [result] = (yield* Effect.either(
      db.query(
        "SELECT count() AS total FROM raw_event_payload WHERE connectionId = $connId AND externalEventId = $extId GROUP BY total LIMIT 1",
        {
          connId: `integration_connection:${connectionId}`,
          extId: externalEventId,
        }
      )
    )) as unknown as [Array<{ total: number }> | null];
    const count = result?.[0]?.total ?? 0;
    return count > 0;
  });
