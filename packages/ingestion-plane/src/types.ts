export interface PlaneUser {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
}

export interface PlaneLabel {
  readonly id: string;
  readonly name: string;
}

export interface PlaneState {
  readonly id: string;
  readonly name: string;
  readonly group: "backlog" | "unstarted" | "started" | "completed" | "cancelled";
}

export interface PlaneIssue {
  readonly id: string;
  readonly sequence_id: number;
  readonly name: string;
  readonly description_html: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly created_by: string;
  readonly assignees: readonly string[];
  readonly state: PlaneState;
  readonly labels: readonly PlaneLabel[];
  readonly url: string;
  readonly project: string;
  readonly workspace__slug: string;
  readonly project_detail: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

export interface PlaneActivity {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly verb: string;
  readonly field: string | null;
  readonly old_value: string | null;
  readonly new_value: string | null;
  readonly actor: string;
  readonly issue: string;
}

export interface PlaneComment {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly comment_html: string;
  readonly actor: string;
  readonly issue: string;
}

export interface PlaneConfig {
  readonly baseUrl: string;
  readonly apiToken: string;
  readonly workspaceSlug: string;
  readonly projectIds: readonly string[];
}

export type PlanePayload = PlaneIssue | PlaneActivity | PlaneComment;

export interface PlaneIssueEnvelope {
  readonly issue: PlaneIssue;
  readonly activities: readonly PlaneActivity[];
  readonly comments: readonly PlaneComment[];
}
