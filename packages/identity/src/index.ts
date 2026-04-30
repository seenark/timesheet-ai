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
