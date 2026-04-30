import type { IdentityStatus, Source } from "./enums";

export interface ExternalIdentity {
  readonly id: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly externalId: string;
  readonly username?: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly canonicalUserId?: string;
  readonly confidence?: number;
  readonly status: IdentityStatus;
  readonly createdAt: string;
}

export interface CreateExternalIdentityInput {
  readonly organizationId: string;
  readonly source: Source;
  readonly externalId: string;
  readonly username?: string;
  readonly email?: string;
  readonly displayName?: string;
}