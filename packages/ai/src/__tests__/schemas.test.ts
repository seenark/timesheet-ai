import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { DailySummaryOutputSchema, WorkUnitOutputSchema } from "../schemas";

describe("WorkUnitOutputSchema", () => {
  it("parses valid data correctly", () => {
    const validData = {
      title: "Implemented user authentication",
      summary:
        "Added JWT-based authentication with login and logout functionality",
      estimatedMinutes: 120,
      confidence: 0.85,
    };

    const result = WorkUnitOutputSchema.parse(validData);
    expect(result).toEqual(validData);
  });

  it("rejects negative minutes", () => {
    const invalidData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: -10,
      confidence: 0.5,
    };

    expect(() => WorkUnitOutputSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it("rejects minutes over 480", () => {
    const invalidData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 500,
      confidence: 0.5,
    };

    expect(() => WorkUnitOutputSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it("rejects confidence greater than 1", () => {
    const invalidData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 60,
      confidence: 1.5,
    };

    expect(() => WorkUnitOutputSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it("rejects negative confidence", () => {
    const invalidData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 60,
      confidence: -0.1,
    };

    expect(() => WorkUnitOutputSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it("rejects missing fields", () => {
    const invalidData = {
      title: "Test",
    };

    expect(() => WorkUnitOutputSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it("rejects extra fields", () => {
    const invalidData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 60,
      confidence: 0.5,
      extraField: "not allowed",
    };

    expect(() => WorkUnitOutputSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it("allows zero confidence", () => {
    const validData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 30,
      confidence: 0,
    };

    const result = WorkUnitOutputSchema.parse(validData);
    expect(result.confidence).toBe(0);
  });

  it("allows confidence of 1", () => {
    const validData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 30,
      confidence: 1,
    };

    const result = WorkUnitOutputSchema.parse(validData);
    expect(result.confidence).toBe(1);
  });

  it("allows minimum minutes of 1", () => {
    const validData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 1,
      confidence: 0.5,
    };

    const result = WorkUnitOutputSchema.parse(validData);
    expect(result.estimatedMinutes).toBe(1);
  });
});

describe("DailySummaryOutputSchema", () => {
  it("parses valid data correctly", () => {
    const validData = {
      summary:
        "Worked on user authentication and fixed several bugs in the login flow.",
    };

    const result = DailySummaryOutputSchema.parse(validData);
    expect(result).toEqual(validData);
  });

  it("rejects missing summary field", () => {
    const invalidData = {};

    expect(() => DailySummaryOutputSchema.parse(invalidData)).toThrow(
      z.ZodError
    );
  });

  it("rejects extra fields", () => {
    const invalidData = {
      summary: "Some summary",
      extraField: "not allowed",
    };

    expect(() => DailySummaryOutputSchema.parse(invalidData)).toThrow(
      z.ZodError
    );
  });
});

describe("Type inference", () => {
  it("WorkUnitOutput type is correctly inferred", () => {
    const validData = {
      title: "Test",
      summary: "Test summary",
      estimatedMinutes: 60,
      confidence: 0.5,
    };

    const result: import("../schemas").WorkUnitOutput = validData;
    expect(result.title).toBe("Test");
  });

  it("DailySummaryOutput type is correctly inferred", () => {
    const validData = {
      summary: "Test summary text",
    };

    const result: import("../schemas").DailySummaryOutput = validData;
    expect(result.summary).toBe("Test summary text");
  });
});
