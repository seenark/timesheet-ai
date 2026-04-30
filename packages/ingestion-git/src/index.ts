export { extractGitIdentities } from "./identity-extractor";
export { normalizeGitPayload } from "./normalizer";
export { GitIngestionPlugin } from "./plugin";
export { extractGitScopes } from "./scope-extractor";
export type {
  GitAuthor,
  GitCommit,
  GitPullRequestPayload,
  GitPushPayload,
  GitWebhookPayload,
} from "./types";
