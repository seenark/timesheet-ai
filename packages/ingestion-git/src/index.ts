export { extractGitIdentities } from "./identity-extractor";
export { GitIngestionPlugin } from "./plugin";
export { normalizeGitPayload } from "./normalizer";
export { extractGitScopes } from "./scope-extractor";
export type {
  GitAuthor,
  GitCommit,
  GitPullRequestPayload,
  GitPushPayload,
  GitWebhookPayload,
} from "./types";
