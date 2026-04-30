import type { CanonicalUser } from "@timesheet-ai/domain";
import type { MatchSignal } from "./types";

const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] =
          Math.min(matrix[i - 1]![j - 1]!, matrix[i]![j - 1]!, matrix[i - 1]![j]!) +
          1;
      }
    }
  }
  return matrix[b.length]![a.length]!;
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
