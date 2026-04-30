import { describe, expect, test } from "bun:test";
import type {
  CanonicalUser,
  ExternalIdentity,
  Source,
} from "@timesheet-ai/domain";
import {
  AUTO_LINK_THRESHOLD,
  matchByDisplayNameSimilar,
  matchByEmailExact,
  matchByUsernameExact,
  resolveIdentity,
  SUGGEST_THRESHOLD,
  scoreCandidate,
} from "./src/index";
import type { IdentityCandidate } from "./src/types";

const makeUser = (overrides: Partial<CanonicalUser> = {}): CanonicalUser =>
  ({
    id: "user-1",
    displayName: "Jane Doe",
    primaryEmail: "jane.doe@example.com",
    organizationId: "org-1",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    role: "member",
    ...overrides,
  }) as CanonicalUser;

const makeCandidate = (
  overrides: Partial<IdentityCandidate> = {}
): IdentityCandidate => ({
  externalId: "ext-1",
  organizationId: "org-1",
  source: "git" as Source,
  ...overrides,
});

const makeIdentity = (
  overrides: Partial<ExternalIdentity> = {}
): ExternalIdentity => ({
  id: "id-1",
  externalId: "ext-1",
  organizationId: "org-1",
  source: "git" as Source,
  status: "pending",
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

describe("matchByEmailExact", () => {
  test("returns signal when email matches primaryEmail case-insensitively", () => {
    const users = [makeUser({ primaryEmail: "Jane.Doe@Example.com" })];
    const signal = matchByEmailExact("jane.doe@example.com", users);
    expect(signal).not.toBeNull();
    expect(signal?.canonicalUserId).toBe("user-1");
    expect(signal?.method).toBe("email-exact");
    expect(signal?.confidence).toBe(0.95);
  });

  test("returns null when no user has matching email", () => {
    const users = [makeUser({ primaryEmail: "other@example.com" })];
    const signal = matchByEmailExact("jane.doe@example.com", users);
    expect(signal).toBeNull();
  });

  test("returns null for empty user list", () => {
    const signal = matchByEmailExact("jane.doe@example.com", []);
    expect(signal).toBeNull();
  });

  test("returns null when user has no primaryEmail", () => {
    const users = [makeUser({ primaryEmail: undefined })];
    const signal = matchByEmailExact("jane.doe@example.com", users);
    expect(signal).toBeNull();
  });
});

describe("matchByUsernameExact", () => {
  test("matches by email local part", () => {
    const users = [makeUser({ primaryEmail: "janedoe@example.com" })];
    const signal = matchByUsernameExact("janedoe", users);
    expect(signal).not.toBeNull();
    expect(signal?.method).toBe("username-exact");
    expect(signal?.confidence).toBe(0.75);
  });

  test("matches by displayName converted to dot-notation", () => {
    const users = [makeUser({ displayName: "Jane Doe" })];
    const signal = matchByUsernameExact("jane.doe", users);
    expect(signal).not.toBeNull();
    expect(signal?.method).toBe("username-exact");
  });

  test("is case insensitive", () => {
    const users = [makeUser({ primaryEmail: "JaneDoe@example.com" })];
    const signal = matchByUsernameExact("JANEDOE", users);
    expect(signal).not.toBeNull();
  });

  test("returns null when no match", () => {
    const users = [makeUser({ primaryEmail: "other@example.com" })];
    const signal = matchByUsernameExact("janedoe", users);
    expect(signal).toBeNull();
  });
});

describe("matchByDisplayNameSimilar", () => {
  test("returns signal for exact match", () => {
    const users = [makeUser({ displayName: "Jane Doe" })];
    const signal = matchByDisplayNameSimilar("Jane Doe", users);
    expect(signal).not.toBeNull();
    expect(signal?.method).toBe("display-name-similar");
    expect(signal?.confidence).toBe(0.7);
  });

  test("returns signal for close match above 0.8 similarity", () => {
    const users = [makeUser({ displayName: "Jane Doe" })];
    const signal = matchByDisplayNameSimilar("Jane Do", users);
    expect(signal).not.toBeNull();
  });

  test("returns null when similarity below 0.8", () => {
    const users = [makeUser({ displayName: "Jane Doe" })];
    const signal = matchByDisplayNameSimilar("John Smith", users);
    expect(signal).toBeNull();
  });

  test("picks highest scoring match", () => {
    const users = [
      makeUser({ id: "user-1", displayName: "Jane Doe" }),
      makeUser({ id: "user-2", displayName: "Jane Doering" }),
    ];
    const signal = matchByDisplayNameSimilar("Jane Doe", users);
    expect(signal).not.toBeNull();
    expect(signal?.canonicalUserId).toBe("user-1");
  });

  test("returns null for empty user list", () => {
    const signal = matchByDisplayNameSimilar("Jane Doe", []);
    expect(signal).toBeNull();
  });
});

describe("scoreCandidate", () => {
  test("returns null for empty signals", () => {
    expect(scoreCandidate([])).toBeNull();
  });

  test("returns highest confidence signal", () => {
    const signals = [
      {
        canonicalUserId: "u1",
        canonicalUserDisplayName: "A",
        confidence: 0.5,
        method: "display-name-similar" as const,
      },
      {
        canonicalUserId: "u2",
        canonicalUserDisplayName: "B",
        confidence: 0.95,
        method: "email-exact" as const,
      },
      {
        canonicalUserId: "u3",
        canonicalUserDisplayName: "C",
        confidence: 0.75,
        method: "username-exact" as const,
      },
    ];
    const best = scoreCandidate(signals);
    expect(best?.canonicalUserId).toBe("u2");
    expect(best?.confidence).toBe(0.95);
  });

  test("returns first when equal confidence", () => {
    const signals = [
      {
        canonicalUserId: "u1",
        canonicalUserDisplayName: "A",
        confidence: 0.75,
        method: "username-exact" as const,
      },
      {
        canonicalUserId: "u2",
        canonicalUserDisplayName: "B",
        confidence: 0.75,
        method: "display-name-similar" as const,
      },
    ];
    const best = scoreCandidate(signals);
    expect(best?.canonicalUserId).toBe("u1");
  });
});

describe("resolveIdentity", () => {
  const users = [
    makeUser({
      id: "u1",
      displayName: "Jane Doe",
      primaryEmail: "jane.doe@example.com",
    }),
    makeUser({
      id: "u2",
      displayName: "John Smith",
      primaryEmail: "john.smith@example.com",
    }),
  ];

  test("auto-links when manual override exists with matched status", () => {
    const identities = [
      makeIdentity({
        source: "git",
        externalId: "ext-1",
        status: "matched",
        canonicalUserId: "u2",
      }),
    ];
    const candidate = makeCandidate({ email: "different@example.com" });
    const result = resolveIdentity(candidate, users, identities);
    expect(result.action).toBe("auto-link");
    expect(result.canonicalUserId).toBe("u2");
    expect(result.confidence).toBe(1.0);
  });

  test("auto-links when email confidence >= 0.9", () => {
    const candidate = makeCandidate({ email: "jane.doe@example.com" });
    const result = resolveIdentity(candidate, users, []);
    expect(result.action).toBe("auto-link");
    expect(result.canonicalUserId).toBe("u1");
    expect(result.method).toBe("email-exact");
    expect(result.confidence).toBe(0.95);
  });

  test("suggests when confidence between 0.5 and 0.9", () => {
    const candidate = makeCandidate({ username: "jane.doe" });
    const result = resolveIdentity(candidate, users, []);
    expect(result.action).toBe("suggest");
    expect(result.canonicalUserId).toBe("u1");
    expect(result.method).toBe("username-exact");
    expect(result.confidence).toBe(0.75);
  });

  test("unmatched when confidence below 0.5", () => {
    const candidate = makeCandidate({ displayName: "Jna Do" });
    const result = resolveIdentity(candidate, users, []);
    expect(result.action).toBe("unmatched");
  });

  test("unmatched when no signals found", () => {
    const candidate = makeCandidate({ externalId: "ext-1" });
    const result = resolveIdentity(candidate, users, []);
    expect(result.action).toBe("unmatched");
    expect(result.confidence).toBe(0);
  });

  test("prefers email match over username when both available", () => {
    const candidate = makeCandidate({
      email: "jane.doe@example.com",
      username: "jane.doe",
    });
    const result = resolveIdentity(candidate, users, []);
    expect(result.action).toBe("auto-link");
    expect(result.canonicalUserId).toBe("u1");
    expect(result.method).toBe("email-exact");
    expect(result.matchedSignals.length).toBe(2);
  });

  test("returns all matched signals in result", () => {
    const candidate = makeCandidate({
      email: "jane.doe@example.com",
      username: "jane.doe",
      displayName: "Jane Doe",
    });
    const result = resolveIdentity(candidate, users, []);
    expect(result.matchedSignals.length).toBe(3);
    const methods = result.matchedSignals.map((s) => s.method);
    expect(methods).toContain("email-exact");
    expect(methods).toContain("username-exact");
    expect(methods).toContain("display-name-similar");
  });

  test("does not auto-link from suggest-threshold identity even if present in existing identities as pending", () => {
    const identities = [
      makeIdentity({
        source: "git",
        externalId: "ext-1",
        status: "pending",
        canonicalUserId: "u1",
      }),
    ];
    const candidate = makeCandidate({ username: "jane.doe" });
    const result = resolveIdentity(candidate, users, identities);
    expect(result.action).toBe("suggest");
    expect(result.canonicalUserId).toBe("u1");
  });

  test("threshold constants are correct", () => {
    expect(AUTO_LINK_THRESHOLD).toBe(0.9);
    expect(SUGGEST_THRESHOLD).toBe(0.5);
  });
});
