import type { UserRole } from "./enums";

export interface CanonicalUser {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly primaryEmail?: string;
  readonly role: UserRole;
  readonly active: boolean;
  readonly createdAt: string;
}

export interface CreateUserInput {
  readonly organizationId: string;
  readonly displayName: string;
  readonly primaryEmail?: string;
  readonly role: UserRole;
}