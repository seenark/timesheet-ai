import type { AttributionMethod, Source } from "./enums";

export interface RawEventPayload {
  readonly checksum: string;
  readonly connectionId: string;
  readonly externalEventId: string;
  readonly id: string;
  readonly organizationId: string;
  readonly payload: unknown;
  readonly receivedAt: string;
  readonly source: string;
}

export interface NormalizedEvent {
  readonly attribution: {
    readonly identityConfidence?: number;
    readonly projectConfidence?: number;
    readonly attributionMethod?: AttributionMethod;
  };
  readonly canonicalUserId?: string;

  readonly content: {
    readonly title?: string;
    readonly body?: string;
    readonly message?: string;
    readonly branch?: string;
    readonly commitSha?: string;
    readonly taskId?: string;
    readonly taskStatus?: string;
    readonly fileCount?: number;
    readonly additions?: number;
    readonly deletions?: number;
    readonly channelName?: string;
    readonly tags?: readonly string[];
  };
  readonly eventTime: string;

  readonly externalIdentityId?: string;
  readonly id: string;
  readonly ingestedAt: string;
  readonly organizationId: string;

  readonly processingVersion: number;
  readonly projectId?: string;
  readonly source: Source;
  readonly sourceEventType: string;

  readonly sourceRef: {
    readonly connectionId: string;
    readonly externalEventId: string;
    readonly externalScopeId?: string;
    readonly externalUrl?: string;
  };
}
