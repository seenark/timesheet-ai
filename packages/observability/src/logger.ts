export interface LogContext {
  readonly [key: string]: unknown;
}

export interface Logger {
  readonly info: (message: string, extra?: LogContext) => void;
  readonly warn: (message: string, extra?: LogContext) => void;
  readonly error: (message: string, extra?: LogContext) => void;
  readonly debug: (message: string, extra?: LogContext) => void;
  readonly child: (context: LogContext) => Logger;
}

const serialize = (level: string, baseContext: LogContext, message: string, extra?: LogContext): string =>
  JSON.stringify({
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...baseContext,
    ...extra,
  });

const emit =
  (level: string, baseContext: LogContext) =>
  (message: string, extra?: LogContext) => {
    const line = serialize(level, baseContext, message, extra);
    switch (level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "debug":
        console.debug(line);
        break;
      default:
        console.info(line);
    }
  };

export const createLogger = (context: LogContext = {}): Logger => ({
  info: emit("info", context),
  warn: emit("warn", context),
  error: emit("error", context),
  debug: emit("debug", context),
  child: (extra: LogContext) => createLogger({ ...context, ...extra }),
});