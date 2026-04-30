import type { UserRole } from "./enums";

export interface CanonicalUser {
  readonly active: boolean;
  readonly createdAt: string;
  readonly displayName: string;
  readonly id: string;
  readonly organizationId: string;
  readonly primaryEmail?: string;
  readonly role: UserRole;
}

export interface CreateUserInput {
  readonly displayName: string;
  readonly organizationId: string;
  readonly primaryEmail?: string;
  readonly role: UserRole;
}
