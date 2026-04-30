export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: string;
}

export interface CreateOrganizationInput {
  readonly name: string;
  readonly slug: string;
}