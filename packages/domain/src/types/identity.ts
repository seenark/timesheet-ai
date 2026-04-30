import type { IdentityStatus, Source } from "./enums";

export interface ExternalIdentity {
  readonly canonicalUserId?: string;
  readonly confidence?: number;
  readonly createdAt: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly externalId: string;
  readonly id: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly status: IdentityStatus;
  readonly username?: string;
}

export interface CreateExternalIdentityInput {
  readonly displayName?: string;
  readonly email?: string;
  readonly externalId: string;
  readonly organizationId: string;
  readonly source: Source;
  readonly username?: string;
}
