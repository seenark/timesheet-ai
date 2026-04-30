import type { CanonicalUser, ExternalIdentity } from "@timesheet-ai/domain";
import {
  AUTO_LINK_THRESHOLD,
  SUGGEST_THRESHOLD,
  type IdentityCandidate,
  type MatchSignal,
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

  const signals: MatchSignal[] = [];

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
