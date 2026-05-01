export interface PlaneUser {
  readonly display_name: string;
  readonly email: string;
  readonly id: string;
}

export interface PlaneLabel {
  readonly id: string;
  readonly name: string;
}

export interface PlaneState {
  readonly group:
    | "backlog"
    | "unstarted"
    | "started"
    | "completed"
    | "cancelled";
  readonly id: string;
  readonly name: string;
}

export interface PlaneIssue {
  readonly assignees: readonly string[];
  readonly created_at: string;
  readonly created_by: string;
  readonly description_html: string;
  readonly id: string;
  readonly labels: readonly PlaneLabel[];
  readonly name: string;
  readonly project: string;
  readonly project_detail: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly sequence_id: number;
  readonly state: PlaneState;
  readonly updated_at: string;
  readonly url: string;
  readonly workspace__slug: string;
}

export interface PlaneActivity {
  readonly actor: string;
  readonly created_at: string;
  readonly field: string | null;
  readonly id: string;
  readonly issue: string;
  readonly new_value: string | null;
  readonly old_value: string | null;
  readonly updated_at: string;
  readonly verb: string;
}

export interface PlaneComment {
  readonly actor: string;
  readonly comment_html: string;
  readonly created_at: string;
  readonly id: string;
  readonly issue: string;
  readonly updated_at: string;
}

export interface PlaneConfig {
  readonly apiToken: string;
  readonly baseUrl: string;
  readonly projectIds: readonly string[];
  readonly workspaceSlug: string;
}

export type PlanePayload = PlaneIssue | PlaneActivity | PlaneComment;

export interface PlaneIssueEnvelope {
  readonly activities: readonly PlaneActivity[];
  readonly comments: readonly PlaneComment[];
  readonly issue: PlaneIssue;
}
