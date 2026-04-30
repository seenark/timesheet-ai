export interface GitAuthor {
  readonly email: string;
  readonly name: string;
}

export interface GitCommit {
  readonly added: readonly string[];
  readonly author: GitAuthor;
  readonly id: string;
  readonly message: string;
  readonly modified: readonly string[];
  readonly removed: readonly string[];
  readonly timestamp: string;
}

export interface GitPushPayload {
  readonly after: string;
  readonly before: string;
  readonly commits: readonly GitCommit[];
  readonly head_commit?: GitCommit;
  readonly ref: string;
  readonly repository: {
    readonly id: number;
    readonly full_name: string;
    readonly html_url: string;
  };
  readonly sender: {
    readonly id: number;
    readonly login: string;
    readonly avatar_url: string;
  };
}

export interface GitPullRequestPayload {
  readonly action: string;
  readonly number: number;
  readonly pull_request: {
    readonly id: number;
    readonly number: number;
    readonly title: string;
    readonly body: string | null;
    readonly state: string;
    readonly html_url: string;
    readonly branch: string;
    readonly user: {
      readonly id: number;
      readonly login: string;
    };
    readonly merged: boolean;
    readonly merged_by?: {
      readonly id: number;
      readonly login: string;
    };
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly repository: {
    readonly id: number;
    readonly full_name: string;
    readonly html_url: string;
  };
  readonly sender: {
    readonly id: number;
    readonly login: string;
  };
}

export type GitWebhookPayload = GitPushPayload | GitPullRequestPayload;
