import type { AttributionMethod, Source } from "./enums";

export interface RawEventPayload {
  readonly id: string;
  readonly organizationId: string;
  readonly source: string;
  readonly connectionId: string;
  readonly externalEventId: string;
  readonly receivedAt: string;
  readonly payload: unknown;
  readonly checksum: string;
}

export interface NormalizedEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly sourceEventType: string;
  readonly eventTime: string;
  readonly ingestedAt: string;

  readonly externalIdentityId?: string;
  readonly canonicalUserId?: string;
  readonly projectId?: string;

  readonly sourceRef: {
    readonly connectionId: string;
    readonly externalEventId: string;
    readonly externalScopeId?: string;
    readonly externalUrl?: string;
  };

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

  readonly attribution: {
    readonly identityConfidence?: number;
    readonly projectConfidence?: number;
    readonly attributionMethod?: AttributionMethod;
  };

  readonly processingVersion: number;
}