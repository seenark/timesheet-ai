import { describe, expect, it, mock } from "bun:test";
import { createLogger } from "../src/logger";

describe("createLogger", () => {
  it("creates a logger with context", () => {
    const log = createLogger({ app: "api", requestId: "req_1" });
    expect(log).toBeDefined();
    expect(log.info).toBeInstanceOf(Function);
    expect(log.error).toBeInstanceOf(Function);
    expect(log.warn).toBeInstanceOf(Function);
    expect(log.debug).toBeInstanceOf(Function);
  });

  it("child() creates a sub-logger with merged context", () => {
    const parent = createLogger({ app: "api" });
    const child = parent.child({ module: "auth" });
    expect(child).toBeDefined();
    expect(child.child).toBeInstanceOf(Function);
  });

  it("info() calls console.info with structured payload", () => {
    const originalConsoleInfo = console.info;
    const spy = mock(() => {});
    console.info = spy;

    const log = createLogger({ app: "test" });
    log.info("test message", { key: "value" });

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0][0];
    const parsed = JSON.parse(call);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test message");
    expect(parsed.app).toBe("test");
    expect(parsed.key).toBe("value");

    console.info = originalConsoleInfo;
  });
});