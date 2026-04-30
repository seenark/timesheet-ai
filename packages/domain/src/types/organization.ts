export interface Organization {
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface CreateOrganizationInput {
  readonly name: string;
  readonly slug: string;
}
