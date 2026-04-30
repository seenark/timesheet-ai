export { computeChecksum, isAlreadyIngested } from "./dedup";
export type { IngestionEvent, IngestionEventType } from "./events";
export { runIngestionPipeline } from "./pipeline";
export {
  getAllPlugins,
  getPlugin,
  registerPlugin,
} from "./registry";
export type {
  ExternalIdentityCandidate,
  IngestionPlugin,
  IngestionResult,
  SourceScopeCandidate,
} from "./types";
export { IngestionError } from "./types";
