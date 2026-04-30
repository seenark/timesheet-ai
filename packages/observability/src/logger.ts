import { Effect, Layer } from "effect";

export const withModule = (module: string) =>
  Effect.annotateLogs({ module });

export const logInfo = (message: string, extra?: Record<string, unknown>) => {
  const base = Effect.logInfo(message);
  return extra ? base.pipe(Effect.annotateLogs(extra)) : base;
};

export const logWarn = (message: string, extra?: Record<string, unknown>) => {
  const base = Effect.logWarning(message);
  return extra ? base.pipe(Effect.annotateLogs(extra)) : base;
};

export const logError = (message: string, extra?: Record<string, unknown>) => {
  const base = Effect.logError(message);
  return extra ? base.pipe(Effect.annotateLogs(extra)) : base;
};

export const logDebug = (message: string, extra?: Record<string, unknown>) => {
  const base = Effect.logDebug(message);
  return extra ? base.pipe(Effect.annotateLogs(extra)) : base;
};

export const ObservabilityLive = Layer.empty;
