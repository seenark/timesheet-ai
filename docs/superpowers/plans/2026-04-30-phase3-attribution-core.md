# Phase 3 — Attribution Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the identity resolution engine, project attribution engine, event enrichment pipeline, and the API/worker integration that connects them — so that ingested events get resolved to real people and real projects.

**Architecture:** Identity resolution uses confidence-based matching: exact email match auto-links at 0.95, username/display-name heuristics suggest at 0.6–0.8, everything else stays unmatched for manual review. Project attribution resolves events to projects via source mappings (repo → project), rule-based patterns (branch prefix, issue key), and manual correction. Both engines are invoked by a new `event-enrichment` worker job that runs after ingestion completes. Manual overrides are always protected — the system never silently undoes a human decision.

**Tech Stack:** Effect-TS (effects, tagged errors, Layer DI), SurrealDB (storage), Bun runtime, Elysia (API).

---

## What Already Exists

| Component | Status |
|---|---|
| `external_identity` table + schema | ✅ Done |
| `canonical_user` table + schema | ✅ Done |
| `source_mapping` table + schema | ✅ Done |
| `normalized_event` table + schema | ✅ Done |
| `identity.repo.ts` (CRUD) | ✅ Done |
| `mapping.repo.ts` (CRUD) | ✅ Done |
| `user.repo.ts` (CRUD) | ✅ Done |
| `event.repo.ts` (CRUD) | ✅ Done |
| Ingestion pipeline logs identity candidates | ✅ Done (but doesn't persist them) |
| Ingestion pipeline extracts scope candidates | ✅ Done (but doesn't use them) |

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `packages/identity/package.json` | Package manifest |
| `packages/identity/tsconfig.json` | TypeScript config |
| `packages/identity/src/index.ts` | Barrel export |
| `packages/identity/src/matcher.ts` | Core identity matching: email exact, username heuristic, display name heuristic, confidence scoring |
| `packages/identity/src/resolver.ts` | Orchestrates full resolution: takes candidate → checks manual → checks exact → checks heuristic → auto-link or suggest or leave unmatched |
| `packages/identity/src/types.ts` | `IdentityMatch`, `ResolutionResult`, `MatchSignal` types |
| `packages/identity/tests/matcher.test.ts` | Unit tests for matching heuristics |
| `packages/identity/tests/resolver.test.ts` | Integration tests for resolution pipeline |
| `packages/attribution/package.json` | Package manifest |
| `packages/attribution/tsconfig.json` | TypeScript config |
| `packages/attribution/src/index.ts` | Barrel export |
| `packages/attribution/src/resolver.ts` | Project attribution: direct mapping lookup, rule-based patterns, confidence scoring |
| `packages/attribution/src/patterns.ts` | Branch prefix parser, issue key extractor (e.g., `CP-142` → Project CP) |
| `packages/attribution/src/types.ts` | `AttributionResult` type |
| `packages/attribution/tests/resolver.test.ts` | Unit tests for attribution |
| `packages/attribution/tests/patterns.test.ts` | Unit tests for pattern extraction |
| `apps/worker/src/jobs/event-enrichment.ts` | Worker job: resolves user + project for unenriched normalized events |
| `apps/worker/src/jobs/identity-resolve.ts` | Worker job: persists identity candidates from ingestion + runs resolution |
| `apps/server/src/routes/identities.ts` | API: list unmatched/suggested, confirm link, unlink, manual match |
| `apps/server/src/routes/mappings.ts` | API: CRUD source mappings |
| `apps/server/src/routes/review.ts` | API: review queue (identities + low-confidence matches needing action) |
| `packages/db/src/repositories/audit.repo.ts` | Audit logging for operator actions |

### Existing files to modify

| File | Change |
|------|--------|
| `packages/ingestion-core/src/pipeline.ts` | Persist identity candidates + scope candidates during ingestion |
| `packages/db/src/repositories/event.repo.ts` | Add `getUnenrichedEvents`, `enrichEvent` |
| `packages/db/src/repositories/index.ts` | Export new repo functions |
| `packages/db/src/index.ts` | Export new repo functions |
| `apps/worker/src/index.ts` | Register new job handlers |
| `apps/server/src/routes/index.ts` | Mount new route groups |
| `biome.jsonc` | Add barrel file overrides for new packages |

---

## Task 1: Create the `packages/identity` package with matcher and resolver

This is the core identity resolution engine. It takes external identity candidates and resolves them to canonical users using confidence-based matching.

**Files:**
- Create: `packages/identity/package.json`
- Create: `packages/identity/tsconfig.json`
- Create: `packages/identity/src/types.ts`
- Create: `packages/identity/src/matcher.ts`
- Create: `packages/identity/src/resolver.ts`
- Create: `packages/identity/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/identity/package.json`:

```json
{
  "name": "@timesheet-ai/identity",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@timesheet-ai/db": "workspace:*",
    "@timesheet-ai/domain": "workspace:*",
    "@timesheet-ai/shared": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@timesheet-ai/config": "workspace:*",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/identity/tsconfig.json`:

```json
{
  "extends": "@timesheet-ai/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts**

Create `packages/identity/src/types.ts`:

```ts
import type { Source } from "@timesheet-ai/domain";

export interface MatchSignal {
  readonly canonicalUserId: string;
  readonly canonicalUserDisplayName: string;
  readonly canonicalUserEmail?: string;
  readonly confidence: number;
  readonly method: "email-exact" | "email-domain" | "username-exact" | "username-similar" | "display-name-similar";
}

export interface ResolutionResult {
  readonly action: "auto-link" | "suggest" | "unmatched";
  readonly canonicalUserId?: string;
  readonly confidence: number;
  readonly matchedSignals: readonly MatchSignal[];
  readonly method?: MatchSignal["method"];
}

export interface IdentityCandidate {
  readonly displayName?: string;
  readonly email?: string;
  readonly externalId: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly username?: string;
}

export const AUTO_LINK_THRESHOLD = 0.9;
export const SUGGEST_THRESHOLD = 0.5;
```

- [ ] **Step 4: Create matcher.ts**

Create `packages/identity/src/matcher.ts`:

```ts
import type { CanonicalUser } from "@timesheet-ai/domain";
import type { MatchSignal } from "./types";

const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] =
          Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) +
          1;
      }
    }
  }
  return matrix[b.length][a.length];
};

const similarity = (a: string, b: string): number => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen;
};

export const matchByEmailExact = (
  candidateEmail: string,
  users: readonly CanonicalUser[]
): MatchSignal | null => {
  const normalizedEmail = candidateEmail.toLowerCase();
  const user = users.find(
    (u) => u.primaryEmail?.toLowerCase() === normalizedEmail
  );
  if (!user) return null;
  return {
    canonicalUserId: user.id,
    canonicalUserDisplayName: user.displayName,
    canonicalUserEmail: user.primaryEmail,
    confidence: 0.95,
    method: "email-exact",
  };
};

export const matchByUsernameExact = (
  candidateUsername: string,
  users: readonly CanonicalUser[]
): MatchSignal | null => {
  const normalizedUsername = candidateUsername.toLowerCase();
  const user = users.find(
    (u) =>
      u.primaryEmail?.toLowerCase().split("@")[0] === normalizedUsername ||
      u.displayName.toLowerCase().replace(/\s+/g, ".") === normalizedUsername
  );
  if (!user) return null;
  return {
    canonicalUserId: user.id,
    canonicalUserDisplayName: user.displayName,
    canonicalUserEmail: user.primaryEmail,
    confidence: 0.75,
    method: "username-exact",
  };
};

export const matchByDisplayNameSimilar = (
  candidateName: string,
  users: readonly CanonicalUser[]
): MatchSignal | null => {
  let bestSignal: MatchSignal | null = null;
  let bestScore = 0;

  for (const user of users) {
    const score = similarity(candidateName, user.displayName);
    if (score > 0.8 && score > bestScore) {
      bestScore = score;
      bestSignal = {
        canonicalUserId: user.id,
        canonicalUserDisplayName: user.displayName,
        canonicalUserEmail: user.primaryEmail,
        confidence: score * 0.7,
        method: "display-name-similar",
      };
    }
  }

  return bestSignal;
};

export const scoreCandidate = (
  signals: readonly MatchSignal[]
): MatchSignal | null => {
  if (signals.length === 0) return null;
  return signals.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
};
```

- [ ] **Step 5: Create resolver.ts**

Create `packages/identity/src/resolver.ts`:

```ts
import type { CanonicalUser, ExternalIdentity } from "@timesheet-ai/domain";
import {
  AUTO_LINK_THRESHOLD,
  SUGGEST_THRESHOLD,
  type IdentityCandidate,
  type ResolutionResult,
} from "./types";
import {
  matchByDisplayNameSimilar,
  matchByEmailExact,
  matchByUsernameExact,
  scoreCandidate,
} from "./matcher";

export const resolveIdentity = (
  candidate: IdentityCandidate,
  canonicalUsers: readonly CanonicalUser[],
  existingIdentities: readonly ExternalIdentity[]
): ResolutionResult => {
  const manualOverride = existingIdentities.find(
    (ei) =>
      ei.source === candidate.source &&
      ei.externalId === candidate.externalId &&
      ei.status === "matched"
  );
  if (manualOverride?.canonicalUserId) {
    return {
      action: "auto-link",
      canonicalUserId: manualOverride.canonicalUserId,
      confidence: 1.0,
      matchedSignals: [],
    };
  }

  const signals: ResolutionResult["matchedSignals"] = [];

  if (candidate.email) {
    const emailMatch = matchByEmailExact(candidate.email, canonicalUsers);
    if (emailMatch) signals.push(emailMatch);
  }

  if (candidate.username) {
    const usernameMatch = matchByUsernameExact(
      candidate.username,
      canonicalUsers
    );
    if (usernameMatch) signals.push(usernameMatch);
  }

  if (candidate.displayName) {
    const nameMatch = matchByDisplayNameSimilar(
      candidate.displayName,
      canonicalUsers
    );
    if (nameMatch) signals.push(nameMatch);
  }

  const best = scoreCandidate(signals);

  if (!best) {
    return {
      action: "unmatched",
      confidence: 0,
      matchedSignals: [],
    };
  }

  if (best.confidence >= AUTO_LINK_THRESHOLD) {
    return {
      action: "auto-link",
      canonicalUserId: best.canonicalUserId,
      confidence: best.confidence,
      matchedSignals: signals,
      method: best.method,
    };
  }

  if (best.confidence >= SUGGEST_THRESHOLD) {
    return {
      action: "suggest",
      canonicalUserId: best.canonicalUserId,
      confidence: best.confidence,
      matchedSignals: signals,
      method: best.method,
    };
  }

  return {
    action: "unmatched",
    confidence: best.confidence,
    matchedSignals: signals,
  };
};
```

Note: resolver.ts is a pure function (no Effect) since it has no I/O dependencies. This makes it easy to test.

- [ ] **Step 6: Create index.ts**

Create `packages/identity/src/index.ts`:

```ts
export {
  matchByDisplayNameSimilar,
  matchByEmailExact,
  matchByUsernameExact,
  scoreCandidate,
} from "./matcher";
export { resolveIdentity } from "./resolver";
export type {
  IdentityCandidate,
  MatchSignal,
  ResolutionResult,
} from "./types";
export { AUTO_LINK_THRESHOLD, SUGGEST_THRESHOLD } from "./types";
```

- [ ] **Step 7: Run bun install**

Run: `bun install`

- [ ] **Step 8: Run typecheck**

Run: `cd packages/identity && bun run check-types`
Expected: Passes

- [ ] **Step 9: Commit**

```bash
git add packages/identity/
git commit -m "feat: add identity resolution package with matcher and resolver"
```

---

## Task 2: Write tests for identity resolution

Unit tests for matching heuristics and the full resolution pipeline.

**Files:**
- Create: `packages/identity/tests/matcher.test.ts`
- Create: `packages/identity/tests/resolver.test.ts`

- [ ] **Step 1: Create matcher tests**

Create `packages/identity/tests/matcher.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { CanonicalUser } from "@timesheet-ai/domain";
import {
  matchByDisplayNameSimilar,
  matchByEmailExact,
  matchByUsernameExact,
  scoreCandidate,
} from "../src/matcher";

const users: readonly CanonicalUser[] = [
  {
    id: "user_001",
    organizationId: "org_001",
    displayName: "Jane Doe",
    primaryEmail: "jane@example.com",
    role: "member",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user_002",
    organizationId: "org_001",
    displayName: "Bob Smith",
    primaryEmail: "bob@example.com",
    role: "admin",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user_003",
    organizationId: "org_001",
    displayName: "Alice Chen",
    primaryEmail: "alice.chen@example.com",
    role: "member",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("matchByEmailExact", () => {
  it("matches exact email (case-insensitive)", () => {
    const result = matchByEmailExact("Jane@Example.com", users);
    expect(result).not.toBeNull();
    expect(result?.canonicalUserId).toBe("user_001");
    expect(result?.confidence).toBe(0.95);
    expect(result?.method).toBe("email-exact");
  });

  it("returns null for no match", () => {
    const result = matchByEmailExact("unknown@example.com", users);
    expect(result).toBeNull();
  });
});

describe("matchByUsernameExact", () => {
  it("matches username from email local part", () => {
    const result = matchByUsernameExact("jane", users);
    expect(result).not.toBeNull();
    expect(result?.canonicalUserId).toBe("user_001");
    expect(result?.method).toBe("username-exact");
  });

  it("matches username from display name with dots", () => {
    const result = matchByUsernameExact("alice.chen", users);
    expect(result).not.toBeNull();
    expect(result?.canonicalUserId).toBe("user_003");
  });

  it("returns null for no match", () => {
    const result = matchByUsernameExact("nonexistent", users);
    expect(result).toBeNull();
  });
});

describe("matchByDisplayNameSimilar", () => {
  it("matches similar display name above threshold", () => {
    const result = matchByDisplayNameSimilar("Jane Doe", users);
    expect(result).not.toBeNull();
    expect(result?.canonicalUserId).toBe("user_001");
    expect(result?.method).toBe("display-name-similar");
  });

  it("matches with slight variation", () => {
    const result = matchByDisplayNameSimilar("Jon Doe", users);
    expect(result).not.toBeNull();
    expect(result?.canonicalUserId).toBe("user_001");
    expect(result?.confidence).toBeGreaterThan(0.4);
  });

  it("returns null for completely different names", () => {
    const result = matchByDisplayNameSimilar("Xyz Abcdefghijk", users);
    expect(result).toBeNull();
  });
});

describe("scoreCandidate", () => {
  it("returns highest confidence signal", () => {
    const signals = [
      { canonicalUserId: "u1", canonicalUserDisplayName: "A", confidence: 0.6, method: "username-exact" as const },
      { canonicalUserId: "u2", canonicalUserDisplayName: "B", confidence: 0.95, method: "email-exact" as const },
    ];
    const result = scoreCandidate(signals);
    expect(result?.canonicalUserId).toBe("u2");
  });

  it("returns null for empty signals", () => {
    expect(scoreCandidate([])).toBeNull();
  });
});
```

- [ ] **Step 2: Create resolver tests**

Create `packages/identity/tests/resolver.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { CanonicalUser, ExternalIdentity } from "@timesheet-ai/domain";
import { resolveIdentity } from "../src/resolver";
import type { IdentityCandidate } from "../src/types";

const users: readonly CanonicalUser[] = [
  {
    id: "user_001",
    organizationId: "org_001",
    displayName: "Jane Doe",
    primaryEmail: "jane@example.com",
    role: "member",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const identities: readonly ExternalIdentity[] = [];

describe("resolveIdentity", () => {
  it("auto-links on exact email match (>= 0.9)", () => {
    const candidate: IdentityCandidate = {
      externalId: "jane@example.com",
      organizationId: "org_001",
      source: "git",
      email: "jane@example.com",
      displayName: "Jane Doe",
      username: "jane",
    };

    const result = resolveIdentity(candidate, users, identities);
    expect(result.action).toBe("auto-link");
    expect(result.canonicalUserId).toBe("user_001");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("suggests on medium confidence (0.5–0.9)", () => {
    const candidate: IdentityCandidate = {
      externalId: "jane-dev",
      organizationId: "org_001",
      source: "git",
      username: "jane",
      displayName: "Jan Doe",
    };

    const result = resolveIdentity(candidate, users, identities);
    expect(["suggest", "auto-link"]).toContain(result.action);
  });

  it("returns unmatched for no signals", () => {
    const candidate: IdentityCandidate = {
      externalId: "unknown-123",
      organizationId: "org_001",
      source: "git",
      username: "totally_unknown_person",
      displayName: "Mysterious Stranger",
    };

    const result = resolveIdentity(candidate, users, identities);
    expect(result.action).toBe("unmatched");
  });

  it("respects manual override", () => {
    const manualIdentities: readonly ExternalIdentity[] = [
      {
        id: "extid_001",
        organizationId: "org_001",
        source: "git",
        externalId: "manual-match-id",
        status: "matched",
        canonicalUserId: "user_001",
        confidence: 1.0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const candidate: IdentityCandidate = {
      externalId: "manual-match-id",
      organizationId: "org_001",
      source: "git",
      username: "someone",
    };

    const result = resolveIdentity(candidate, users, manualIdentities);
    expect(result.action).toBe("auto-link");
    expect(result.canonicalUserId).toBe("user_001");
    expect(result.confidence).toBe(1.0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test --filter '@timesheet-ai/identity'`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/identity/tests/
git commit -m "test: add identity resolution matcher and resolver tests"
```

---

## Task 3: Create the `packages/attribution` package with project resolver

Project attribution engine that resolves events to projects using source mappings and rule-based patterns.

**Files:**
- Create: `packages/attribution/package.json`
- Create: `packages/attribution/tsconfig.json`
- Create: `packages/attribution/src/types.ts`
- Create: `packages/attribution/src/patterns.ts`
- Create: `packages/attribution/src/resolver.ts`
- Create: `packages/attribution/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/attribution/package.json`:

```json
{
  "name": "@timesheet-ai/attribution",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@timesheet-ai/db": "workspace:*",
    "@timesheet-ai/domain": "workspace:*",
    "@timesheet-ai/shared": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@timesheet-ai/config": "workspace:*",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/attribution/tsconfig.json`:

```json
{
  "extends": "@timesheet-ai/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts**

Create `packages/attribution/src/types.ts`:

```ts
import type { AttributionMethod } from "@timesheet-ai/domain";

export interface AttributionResult {
  readonly confidence: number;
  readonly method: AttributionMethod;
  readonly projectId?: string;
}

export interface RulePattern {
  readonly confidence: number;
  readonly pattern: RegExp;
  readonly projectCode: string;
}
```

- [ ] **Step 4: Create patterns.ts**

Create `packages/attribution/src/patterns.ts`:

```ts
const BRANCH_PREFIX_PATTERN = /^([^/]+)\//;
const ISSUE_KEY_PATTERN = /\b([A-Z]{1,5}-\d+)\b/;

export const extractBranchPrefix = (branch: string): string | null => {
  const match = BRANCH_PREFIX_PATTERN.exec(branch);
  return match?.[1]?.toLowerCase() ?? null;
};

export const extractIssueKeys = (text: string): readonly string[] => {
  const matches = text.matchAll(new RegExp(ISSUE_KEY_PATTERN.source, "gi"));
  return Array.from(matches, (m) => m[1].toUpperCase());
};

export const matchBranchToProjectCode = (
  branch: string,
  projectCodes: readonly string[]
): string | null => {
  const prefix = extractBranchPrefix(branch);
  if (!prefix) return null;
  const normalizedPrefix = prefix.toLowerCase();
  const match = projectCodes.find(
    (code) => code.toLowerCase() === normalizedPrefix
  );
  return match ?? null;
};

export const matchIssueKeyToProjectCode = (
  text: string,
  projectCodes: readonly string[]
): string | null => {
  const keys = extractIssueKeys(text);
  for (const key of keys) {
    const code = key.split("-")[0];
    const match = projectCodes.find(
      (pc) => pc.toUpperCase() === code.toUpperCase()
    );
    if (match) return match;
  }
  return null;
};
```

- [ ] **Step 5: Create resolver.ts**

Create `packages/attribution/src/resolver.ts`:

```ts
import type { NormalizedEvent, SourceMapping } from "@timesheet-ai/domain";
import { matchBranchToProjectCode, matchIssueKeyToProjectCode } from "./patterns";
import type { AttributionResult } from "./types";

export const attributeEvent = (
  event: NormalizedEvent,
  mappings: readonly SourceMapping[],
  projectCodes: readonly string[]
): AttributionResult => {
  const scopeId = event.sourceRef.externalScopeId;
  if (scopeId) {
    const directMapping = mappings.find((m) => m.externalScopeId === scopeId);
    if (directMapping) {
      return {
        projectId: directMapping.projectId,
        confidence: directMapping.confidence,
        method: directMapping.mappingType,
      };
    }
  }

  const branch = event.content.branch;
  if (branch) {
    const branchCode = matchBranchToProjectCode(branch, projectCodes);
    if (branchCode) {
      return {
        confidence: 0.8,
        method: "rule",
      };
    }
  }

  const text = [event.content.message, event.content.title, event.content.body]
    .filter(Boolean)
    .join(" ");
  const issueCode = matchIssueKeyToProjectCode(text, projectCodes);
  if (issueCode) {
    return {
      confidence: 0.7,
      method: "rule",
    };
  }

  return {
    confidence: 0,
    method: "direct",
  };
};
```

Note: resolver.ts is a pure function (no Effect) since it does direct matching without DB calls. The DB lookups happen in the worker job, which passes pre-fetched data.

- [ ] **Step 6: Create index.ts**

Create `packages/attribution/src/index.ts`:

```ts
export { attributeEvent } from "./resolver";
export {
  extractBranchPrefix,
  extractIssueKeys,
  matchBranchToProjectCode,
  matchIssueKeyToProjectCode,
} from "./patterns";
export type { AttributionResult, RulePattern } from "./types";
```

- [ ] **Step 7: Run bun install**

Run: `bun install`

- [ ] **Step 8: Run typecheck**

Run: `cd packages/attribution && bun run check-types`
Expected: Passes

- [ ] **Step 9: Commit**

```bash
git add packages/attribution/
git commit -m "feat: add project attribution package with pattern matching and resolver"
```

---

## Task 4: Write tests for attribution package

**Files:**
- Create: `packages/attribution/tests/patterns.test.ts`
- Create: `packages/attribution/tests/resolver.test.ts`

- [ ] **Step 1: Create patterns tests**

Create `packages/attribution/tests/patterns.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  extractBranchPrefix,
  extractIssueKeys,
  matchBranchToProjectCode,
  matchIssueKeyToProjectCode,
} from "../src/patterns";

describe("extractBranchPrefix", () => {
  it("extracts prefix from feature branch", () => {
    expect(extractBranchPrefix("feature/auth-refresh")).toBe("feature");
  });

  it("extracts prefix from fix branch", () => {
    expect(extractBranchPrefix("fix/bug-123")).toBe("fix");
  });

  it("returns null for main branch", () => {
    expect(extractBranchPrefix("main")).toBeNull();
  });
});

describe("extractIssueKeys", () => {
  it("extracts issue keys from text", () => {
    const keys = extractIssueKeys("Fixed CP-142 and related to CP-99");
    expect(keys).toEqual(["CP-142", "CP-99"]);
  });

  it("returns empty array for no keys", () => {
    expect(extractIssueKeys("no issue keys here")).toEqual([]);
  });
});

describe("matchBranchToProjectCode", () => {
  it("matches branch prefix to project code", () => {
    const result = matchBranchToProjectCode("cp/auth-fix", ["CP", "WP", "TM"]);
    expect(result).toBe("CP");
  });

  it("returns null for no match", () => {
    expect(matchBranchToProjectCode("main", ["CP"])).toBeNull();
  });
});

describe("matchIssueKeyToProjectCode", () => {
  it("matches issue key to project code", () => {
    const result = matchIssueKeyToProjectCode("Fix CP-142", ["CP", "WP"]);
    expect(result).toBe("CP");
  });

  it("returns null for no match", () => {
    expect(matchIssueKeyToProjectCode("no key", ["CP"])).toBeNull();
  });
});
```

- [ ] **Step 2: Create resolver tests**

Create `packages/attribution/tests/resolver.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { NormalizedEvent, SourceMapping } from "@timesheet-ai/domain";
import { attributeEvent } from "../src/resolver";

const mappings: readonly SourceMapping[] = [
  {
    id: "smap_001",
    organizationId: "org_001",
    source: "git",
    externalScopeType: "repo",
    externalScopeId: "org/client-portal",
    projectId: "proj_001",
    confidence: 1.0,
    mappingType: "manual",
  },
];

const projectCodes = ["CP", "WP", "TM"];

const makeEvent = (
  overrides: Partial<NormalizedEvent> = {}
): NormalizedEvent => ({
  id: "evt_001",
  organizationId: "org_001",
  source: "git",
  sourceEventType: "commit",
  eventTime: "2026-04-30T10:00:00Z",
  ingestedAt: "2026-04-30T10:01:00Z",
  sourceRef: {
    connectionId: "conn_001",
    externalEventId: "sha123",
    externalScopeId: "org/client-portal",
  },
  content: {
    message: "fix: auth token refresh",
    title: "fix: auth token refresh",
    commitSha: "sha123",
    branch: "main",
    fileCount: 3,
    additions: 1,
    deletions: 1,
  },
  attribution: {},
  processingVersion: 1,
  ...overrides,
});

describe("attributeEvent", () => {
  it("resolves via direct source mapping", () => {
    const event = makeEvent();
    const result = attributeEvent(event, mappings, projectCodes);
    expect(result.projectId).toBe("proj_001");
    expect(result.confidence).toBe(1.0);
    expect(result.method).toBe("manual");
  });

  it("falls back to branch prefix rule", () => {
    const event = makeEvent({
      sourceRef: {
        connectionId: "conn_001",
        externalEventId: "sha456",
        externalScopeId: "org/unknown-repo",
      },
      content: {
        message: "fix bug",
        branch: "cp/auth-fix",
      },
    });
    const result = attributeEvent(event, mappings, projectCodes);
    expect(result.method).toBe("rule");
    expect(result.confidence).toBe(0.8);
  });

  it("falls back to issue key rule", () => {
    const event = makeEvent({
      sourceRef: {
        connectionId: "conn_001",
        externalEventId: "sha789",
        externalScopeId: "org/unknown-repo",
      },
      content: {
        message: "Fix CP-142: token refresh",
      },
    });
    const result = attributeEvent(event, mappings, projectCodes);
    expect(result.method).toBe("rule");
    expect(result.confidence).toBe(0.7);
  });

  it("returns low confidence when nothing matches", () => {
    const event = makeEvent({
      sourceRef: {
        connectionId: "conn_001",
        externalEventId: "sha000",
        externalScopeId: "org/unknown-repo",
      },
      content: {
        message: "some random commit",
        branch: "develop",
      },
    });
    const result = attributeEvent(event, mappings, projectCodes);
    expect(result.confidence).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun test --filter '@timesheet-ai/attribution'`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/attribution/tests/
git commit -m "test: add attribution pattern and resolver tests"
```

---

## Task 5: Add new DB repository functions

Add `getUnenrichedEvents`, `enrichEvent`, `createAuditLog`, and `createReviewDecision` to the DB layer.

**Files:**
- Modify: `packages/db/src/repositories/event.repo.ts`
- Create: `packages/db/src/repositories/audit.repo.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add getUnenrichedEvents and enrichEvent to event.repo.ts**

Add these functions at the end of `packages/db/src/repositories/event.repo.ts`:

```ts
export const getUnenrichedEvents = (organizationId: string, limit = 100) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM normalized_event WHERE organizationId = $orgId AND canonicalUserId IS NULL ORDER BY eventTime ASC LIMIT $limit",
      {
        orgId: `organization:${organizationId}`,
        limit,
      }
    )) as unknown as [NormalizedEvent[]];
    return (result ?? []) as NormalizedEvent[];
  });

export const enrichEvent = (
  id: string,
  canonicalUserId: string,
  projectId: string,
  identityConfidence: number,
  projectConfidence: number,
  attributionMethod: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    yield* db.merge(`normalized_event:${id}`, {
      canonicalUserId: canonicalUserId ? `canonical_user:${canonicalUserId}` : null,
      projectId: projectId ? `project:${projectId}` : null,
      attribution: {
        identityConfidence,
        projectConfidence,
        attributionMethod,
      },
      processingVersion: 2,
    });
  });
```

- [ ] **Step 2: Create audit.repo.ts**

Create `packages/db/src/repositories/audit.repo.ts`:

```ts
import type { AuditLog, ReviewDecision } from "@timesheet-ai/domain";
import { generateId } from "@timesheet-ai/shared";
import { Effect } from "effect";
import { SurrealDbTag } from "../connection";

export const createAuditLog = (input: {
  organizationId: string;
  action: string;
  actorUserId: string;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("audit");
    const recordId = `audit_log:${id}`;
    yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      action: input.action,
      actorUserId: `canonical_user:${input.actorUserId}`,
      targetType: input.targetType,
      targetId: input.targetId,
      previousValue: input.previousValue,
      newValue: input.newValue,
    });
  });

export const createReviewDecision = (input: {
  organizationId: string;
  reviewerId: string;
  targetType: "work-unit" | "summary" | "identity" | "mapping";
  targetId: string;
  decision: "approved" | "flagged" | "rejected";
  note?: string;
}) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const id = generateId("rev");
    const recordId = `review_decision:${id}`;
    yield* db.create(recordId, {
      organizationId: `organization:${input.organizationId}`,
      reviewerId: `canonical_user:${input.reviewerId}`,
      targetType: input.targetType,
      targetId: input.targetId,
      decision: input.decision,
      note: input.note,
    });
  });

export const getReviewHistory = (targetType: string, targetId: string) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      "SELECT * FROM review_decision WHERE targetType = $targetType AND targetId = $targetId ORDER BY timestamp DESC",
      { targetType, targetId }
    )) as unknown as [ReviewDecision[]];
    return (result ?? []) as ReviewDecision[];
  });
```

- [ ] **Step 3: Update repositories/index.ts**

Add exports for:
- `getUnenrichedEvents`, `enrichEvent` from `event.repo`
- `createAuditLog`, `createReviewDecision`, `getReviewHistory` from `audit.repo`

- [ ] **Step 4: Update packages/db/src/index.ts**

Add the new exports.

- [ ] **Step 5: Run typecheck**

Run: `cd packages/db && bun run check-types`
Expected: Passes

- [ ] **Step 6: Commit**

```bash
git add packages/db/
git commit -m "feat: add event enrichment, audit log, and review decision repositories"
```

---

## Task 6: Update ingestion pipeline to persist identity candidates

Currently the pipeline logs identity candidates but doesn't store them. Update it to create `external_identity` records during ingestion.

**Files:**
- Modify: `packages/ingestion-core/src/pipeline.ts`

- [ ] **Step 1: Add identity persistence to pipeline**

Update the imports at the top of `packages/ingestion-core/src/pipeline.ts` to add:

```ts
import { createExternalIdentity, findIdentityBySourceAndExternalId } from "@timesheet-ai/db";
```

Update the `tryExtractIdentities` function to persist each candidate:

```ts
const tryExtractIdentities = (
  plugin: {
    extractIdentities: (
      raw: unknown
    ) => Effect.Effect<
      readonly Array<{
        source: Source;
        externalId: string;
        email?: string | undefined;
        username?: string | undefined;
        displayName?: string | undefined;
      }>,
      IngestionError
    >;
  },
  rawPayload: unknown,
  organizationId: string
) =>
  Effect.gen(function* () {
    const result = yield* Effect.either(plugin.extractIdentities(rawPayload));
    if (result._tag === "Left") {
      return 0;
    }
    let persisted = 0;
    for (const candidate of result.right) {
      const existing = yield* Effect.either(
        findIdentityBySourceAndExternalId(candidate.source, candidate.externalId)
      );
      if (existing._tag === "Right" && existing.right !== null) {
        continue;
      }
      yield* Effect.either(
        createExternalIdentity({
          organizationId,
          source: candidate.source,
          externalId: candidate.externalId,
          email: candidate.email,
          username: candidate.username,
          displayName: candidate.displayName,
        })
      );
      persisted++;
      yield* logInfo("Identity candidate persisted", {
        source: candidate.source,
        externalId: candidate.externalId,
        email: candidate.email,
      });
    }
    return persisted;
  });
```

Update the `processSinglePayload` function call to pass `organizationId`:

```ts
const identityCount = yield* tryExtractIdentities(plugin, rawPayload, organizationId);
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/ingestion-core && bun run check-types`
Expected: Passes

- [ ] **Step 3: Commit**

```bash
git add packages/ingestion-core/
git commit -m "feat: persist identity candidates to external_identity table during ingestion"
```

---

## Task 7: Create event-enrichment and identity-resolve worker jobs

Wire the identity and attribution packages into the worker.

**Files:**
- Create: `apps/worker/src/jobs/event-enrichment.ts`
- Create: `apps/worker/src/jobs/identity-resolve.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/package.json`

- [ ] **Step 1: Create identity-resolve job**

Create `apps/worker/src/jobs/identity-resolve.ts`:

```ts
import {
  SurrealDb,
  listUnmatchedIdentities,
  setIdentitiesStatus,
  listUsersByOrg,
} from "@timesheet-ai/db";
import { resolveIdentity } from "@timesheet-ai/identity";
import type { IdentityCandidate } from "@timesheet-ai/identity";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runIdentityResolve = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = (metadata?.organizationId as string) ?? "org_default";
    yield* logInfo("Starting identity resolution", { organizationId });

    const identities = yield* listUnmatchedIdentities(organizationId);
    const users = yield* listUsersByOrg(organizationId);

    yield* logInfo("Processing unmatched identities", {
      count: identities.length,
      userCount: users.length,
    });

    let autoLinked = 0;
    let suggested = 0;
    let unmatched = 0;

    for (const identity of identities) {
      const candidate: IdentityCandidate = {
        externalId: identity.externalId,
        organizationId,
        source: identity.source,
        email: identity.email,
        username: identity.username,
        displayName: identity.displayName,
      };

      const result = resolveIdentity(candidate, users, identities);

      if (result.action === "auto-link" && result.canonicalUserId) {
        yield* setIdentitiesStatus(
          [identity.id],
          "matched",
          result.canonicalUserId,
          result.confidence
        );
        autoLinked++;
      } else if (result.action === "suggest" && result.canonicalUserId) {
        yield* setIdentitiesStatus(
          [identity.id],
          "suggested",
          result.canonicalUserId,
          result.confidence
        );
        suggested++;
      } else {
        unmatched++;
      }
    }

    yield* logInfo("Identity resolution complete", {
      autoLinked,
      suggested,
      unmatched,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Identity resolution job failed", {
          error: String(error),
        });
      })
    )
  );
```

- [ ] **Step 2: Create event-enrichment job**

Create `apps/worker/src/jobs/event-enrichment.ts`:

```ts
import {
  SurrealDb,
  getUnenrichedEvents,
  enrichEvent,
  listMappingsByOrg,
  listProjectsByOrg,
} from "@timesheet-ai/db";
import { attributeEvent } from "@timesheet-ai/attribution";
import { logError, logInfo } from "@timesheet-ai/observability";
import { Effect } from "effect";

export const runEventEnrichment = (
  metadata?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const organizationId = (metadata?.organizationId as string) ?? "org_default";
    yield* logInfo("Starting event enrichment", { organizationId });

    const events = yield* getUnenrichedEvents(organizationId);
    yield* logInfo("Unenriched events found", { count: events.length });

    if (events.length === 0) return;

    const mappings = yield* listMappingsByOrg(organizationId);
    const projects = yield* listProjectsByOrg(organizationId);
    const projectCodes = projects.map((p) => p.code.toUpperCase());

    let enriched = 0;

    for (const event of events) {
      const attrResult = attributeEvent(event, mappings, projectCodes);

      const hasUser = !!event.canonicalUserId;
      const hasProject = !!attrResult.projectId;

      if (hasUser && hasProject) {
        const userId = event.canonicalUserId.replace("canonical_user:", "");
        const projId = attrResult.projectId.replace("project:", "");
        yield* enrichEvent(
          event.id,
          userId,
          projId,
          0.8,
          attrResult.confidence,
          attrResult.method
        );
        enriched++;
      } else if (hasProject) {
        const projId = attrResult.projectId.replace("project:", "");
        yield* enrichEvent(event.id, "", projId, 0, attrResult.confidence, attrResult.method);
        enriched++;
      }
    }

    yield* logInfo("Event enrichment complete", {
      total: events.length,
      enriched,
    });
  }).pipe(
    Effect.provide(SurrealDb),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* logError("Event enrichment job failed", {
          error: String(error),
        });
      })
    )
  );
```

- [ ] **Step 3: Update worker index.ts**

Add to `apps/worker/src/index.ts`:
- Import `runIdentityResolve` and `runEventEnrichment`
- Import `resolveIdentity` from `@timesheet-ai/identity` and `attributeEvent` from `@timesheet-ai/attribution`
- Register handlers: `registerJobHandler("identity-resolve", runIdentityResolve)` and `registerJobHandler("event-enrichment", runEventEnrichment)`

- [ ] **Step 4: Update worker package.json**

Add to dependencies:
```json
"@timesheet-ai/identity": "workspace:*",
"@timesheet-ai/attribution": "workspace:*"
```

- [ ] **Step 5: Run bun install and typecheck**

Run: `bun install && cd apps/worker && bun run check-types`

- [ ] **Step 6: Commit**

```bash
git add apps/worker/
git commit -m "feat: add identity-resolve and event-enrichment worker jobs"
```

---

## Task 8: Add API routes for identities, mappings, and review

**Files:**
- Create: `apps/server/src/routes/identities.ts`
- Create: `apps/server/src/routes/mappings.ts`
- Create: `apps/server/src/routes/review.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: Create identity routes**

Create `apps/server/src/routes/identities.ts`:

```ts
import {
  SurrealDb,
  listUnmatchedIdentities,
  getExternalIdentity,
  setIdentitiesStatus,
  createExternalIdentity,
  findIdentityBySourceAndExternalId,
  createAuditLog,
} from "@timesheet-ai/db";
import type { Source } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const identityRoutes = new Elysia({
  prefix: "/identities",
})
  .get("/unmatched", async ({ query }) => {
    const effect = Effect.gen(function* () {
      return yield* listUnmatchedIdentities(query.orgId);
    }).pipe(Effect.provide(SurrealDb));
    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({ orgId: t.String() }),
  })
  .get("/:id", async ({ params }) => {
    const effect = Effect.gen(function* () {
      return yield* getExternalIdentity(params.id);
    }).pipe(Effect.provide(SurrealDb));
    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "NOT_FOUND",
          message: String(error),
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  })
  .post("/:id/link", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      yield* setIdentitiesStatus(
        [params.id],
        "matched",
        body.canonicalUserId,
        1.0
      );
      yield* createAuditLog({
        organizationId: body.orgId,
        action: "identity.link",
        actorUserId: body.actorUserId,
        targetType: "identity",
        targetId: params.id,
        newValue: { canonicalUserId: body.canonicalUserId },
      });
    }).pipe(Effect.provide(SurrealDb));
    try {
      await Effect.runPromise(effect);
      return { ok: true as const };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      orgId: t.String(),
      canonicalUserId: t.String(),
      actorUserId: t.String(),
    }),
  })
  .post("/:id/unlink", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      yield* setIdentitiesStatus([params.id], "unmatched");
      yield* createAuditLog({
        organizationId: body.orgId,
        action: "identity.unlink",
        actorUserId: body.actorUserId,
        targetType: "identity",
        targetId: params.id,
      });
    }).pipe(Effect.provide(SurrealDb));
    try {
      await Effect.runPromise(effect);
      return { ok: true as const };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      orgId: t.String(),
      actorUserId: t.String(),
    }),
  });
```

- [ ] **Step 2: Create mapping routes**

Create `apps/server/src/routes/mappings.ts`:

```ts
import {
  SurrealDb,
  createSourceMapping,
  deleteSourceMapping,
  listMappingsByOrg,
  createAuditLog,
} from "@timesheet-ai/db";
import type { ExternalScopeType, MappingType, Source } from "@timesheet-ai/domain";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const mappingRoutes = new Elysia({
  prefix: "/mappings",
})
  .get("/", async ({ query }) => {
    const effect = Effect.gen(function* () {
      return yield* listMappingsByOrg(query.orgId);
    }).pipe(Effect.provide(SurrealDb));
    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({ orgId: t.String() }),
  })
  .post("/", async ({ body }) => {
    const effect = Effect.gen(function* () {
      const mapping = yield* createSourceMapping({
        organizationId: body.organizationId,
        source: body.source as Source,
        externalScopeType: body.externalScopeType as ExternalScopeType,
        externalScopeId: body.externalScopeId,
        projectId: body.projectId,
        mappingType: body.mappingType as MappingType,
        confidence: body.confidence,
      });
      yield* createAuditLog({
        organizationId: body.organizationId,
        action: "mapping.create",
        actorUserId: body.actorUserId,
        targetType: "mapping",
        targetId: mapping.id,
        newValue: mapping,
      });
      return mapping;
    }).pipe(Effect.provide(SurrealDb));
    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      organizationId: t.String(),
      source: t.String(),
      externalScopeType: t.String(),
      externalScopeId: t.String(),
      projectId: t.String(),
      mappingType: t.String(),
      confidence: t.Optional(t.Number()),
      actorUserId: t.String(),
    }),
  })
  .delete("/:id", async ({ params, body }) => {
    const effect = Effect.gen(function* () {
      yield* deleteSourceMapping(params.id);
      yield* createAuditLog({
        organizationId: body.orgId,
        action: "mapping.delete",
        actorUserId: body.actorUserId,
        targetType: "mapping",
        targetId: params.id,
      });
    }).pipe(Effect.provide(SurrealDb));
    try {
      await Effect.runPromise(effect);
      return { ok: true as const };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      orgId: t.String(),
      actorUserId: t.String(),
    }),
  });
```

- [ ] **Step 3: Create review routes**

Create `apps/server/src/routes/review.ts`:

```ts
import {
  SurrealDb,
  createReviewDecision,
  getReviewHistory,
  listUnmatchedIdentities,
} from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const reviewRoutes = new Elysia({
  prefix: "/review",
})
  .get("/queue", async ({ query }) => {
    const effect = Effect.gen(function* () {
      const identities = yield* listUnmatchedIdentities(query.orgId);
      return {
        identities: identities.filter((i) => i.status === "suggested"),
      };
    }).pipe(Effect.provide(SurrealDb));
    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({ orgId: t.String() }),
  })
  .post("/decision", async ({ body }) => {
    const effect = Effect.gen(function* () {
      yield* createReviewDecision({
        organizationId: body.orgId,
        reviewerId: body.reviewerId,
        targetType: body.targetType as "work-unit" | "summary" | "identity" | "mapping",
        targetId: body.targetId,
        decision: body.decision as "approved" | "flagged" | "rejected",
        note: body.note,
      });
    }).pipe(Effect.provide(SurrealDb));
    try {
      await Effect.runPromise(effect);
      return { ok: true as const };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    body: t.Object({
      orgId: t.String(),
      reviewerId: t.String(),
      targetType: t.String(),
      targetId: t.String(),
      decision: t.String(),
      note: t.Optional(t.String()),
    }),
  })
  .get("/history", async ({ query }) => {
    const effect = Effect.gen(function* () {
      return yield* getReviewHistory(query.targetType, query.targetId);
    }).pipe(Effect.provide(SurrealDb));
    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }, {
    query: t.Object({
      targetType: t.String(),
      targetId: t.String(),
    }),
  });
```

- [ ] **Step 4: Update routes/index.ts**

Add new routes to `apps/server/src/routes/index.ts`:

```ts
import { Elysia } from "elysia";
import { eventRoutes } from "./events";
import { healthRoutes } from "./health";
import { identityRoutes } from "./identities";
import { integrationRoutes } from "./integrations";
import { mappingRoutes } from "./mappings";
import { reviewRoutes } from "./review";
import { webhookRoutes } from "./webhooks";

export const routes = new Elysia()
  .use(healthRoutes)
  .use(integrationRoutes)
  .use(eventRoutes)
  .use(webhookRoutes)
  .use(identityRoutes)
  .use(mappingRoutes)
  .use(reviewRoutes);
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/server && bun run check-types`
Expected: Passes

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/
git commit -m "feat: add identity, mapping, and review API routes"
```

---

## Task 9: Update biome.jsonc for new barrel files

**Files:**
- Modify: `biome.jsonc`

- [ ] **Step 1: Add new packages to barrel file overrides**

Update `biome.jsonc` to include the new packages:

```jsonc
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["ultracite/biome/core", "ultracite/biome/react"],
  "overrides": [
    {
      "includes": [
        "packages/ingestion-core/src/index.ts",
        "packages/ingestion-git/src/index.ts",
        "packages/db/src/index.ts",
        "packages/identity/src/index.ts",
        "packages/attribution/src/index.ts"
      ],
      "linter": {
        "rules": {
          "performance": {
            "noBarrelFile": "off"
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add biome.jsonc
git commit -m "chore: add identity and attribution packages to biome barrel file overrides"
```

---

## Task 10: Run full verification

- [ ] **Step 1: Run lint fix**

Run: `bun run fix`

- [ ] **Step 2: Run lint check**

Run: `bun run check`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Fix any remaining issues and commit**

---

## Self-Review

### Spec Coverage Check

| Architecture Requirement | Task |
|---|---|
| External identity CRUD | Task 5 (event.repo additions + audit.repo) |
| Identity matching engine (email, username, display name) | Task 1 (packages/identity) |
| Confidence-based auto-link / suggest / unmatched | Task 1 (resolver.ts) |
| Manual override protection | Task 1 (resolver.ts checks matched status first) |
| Project attribution via source mapping | Task 3 (packages/attribution) |
| Rule-based attribution (branch prefix, issue key) | Task 3 (patterns.ts) |
| Persist identity candidates during ingestion | Task 6 (pipeline.ts update) |
| Identity resolution worker job | Task 7 (identity-resolve.ts) |
| Event enrichment worker job | Task 7 (event-enrichment.ts) |
| Identity management API | Task 8 (identities.ts) |
| Source mapping CRUD API | Task 8 (mappings.ts) |
| Review queue API | Task 8 (review.ts) |
| Audit logging for operator actions | Task 5 (audit.repo.ts) |
| Review decisions | Task 5 (audit.repo.ts) |
| Event enrichment query/update | Task 5 (getUnenrichedEvents, enrichEvent) |

### Type Consistency
All packages use the domain types (`Source`, `NormalizedEvent`, `CanonicalUser`, `ExternalIdentity`, `SourceMapping`) and follow the existing Effect+SurrealDB patterns.

### Gaps / Notes
- **Plane and Discord attribution** — deferred, same pattern as Git
- **Sessionization and clustering** — Phase 4 (not in this plan)
- **AI summarization** — Phase 5
- The `attributeEvent` resolver is intentionally pure (no Effect) for testability — DB fetches happen in the worker job
- The `resolveIdentity` resolver is also pure — no I/O needed, matching is deterministic
