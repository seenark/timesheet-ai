import type { Source } from "@timesheet-ai/domain";

export interface MatchSignal {
  readonly canonicalUserDisplayName: string;
  readonly canonicalUserEmail?: string;
  readonly canonicalUserId: string;
  readonly confidence: number;
  readonly method:
    | "email-exact"
    | "email-domain"
    | "username-exact"
    | "username-similar"
    | "display-name-similar";
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
