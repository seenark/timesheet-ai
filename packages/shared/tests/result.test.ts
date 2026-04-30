import { describe, expect, it } from "bun:test";
import { err, isErr, isOk, ok } from "../src/result";

describe("Result", () => {
  it("ok() creates a successful result", () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it("err() creates an error result", () => {
    const result = err("something failed");
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (isErr(result)) {
      expect(result.error).toBe("something failed");
    }
  });
});