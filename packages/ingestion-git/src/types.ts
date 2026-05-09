export interface GitConfig {
  readonly authToken?: string;
  readonly branch?: string;
  readonly localPath: string;
  readonly repoUrl: string;
}

export interface RawCommit {
  readonly authorDate: string;
  readonly authorEmail: string;
  readonly authorName: string;
  readonly body: string;
  readonly hash: string;
  readonly parentCount: number;
  readonly refNames: readonly string[];
  readonly subject: string;
}

export interface CommitDiff {
  readonly deletions: number;
  readonly filesChanged: number;
  readonly insertions: number;
}

export interface GitCommitEnvelope {
  readonly commit: {
    readonly authorEmail: string;
    readonly authorName: string;
    readonly branch?: string;
    readonly date: string;
    readonly hash: string;
    readonly message: string;
    readonly parentCount: number;
  };
  readonly diff: {
    readonly deletions: number;
    readonly filesChanged: number;
    readonly insertions: number;
  };
  readonly repoName: string;
}
