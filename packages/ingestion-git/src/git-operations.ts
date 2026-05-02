import { exists } from "node:fs/promises";
import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { CommitDiff, GitConfig, RawCommit } from "./types";

declare const Bun: typeof globalThis.Bun;

const GIT_LOG_FORMAT =
  "%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%P%x00%D%x00%x01";

const RE_FILES_CHANGED = /(\d+) files? changed/;
const RE_INSERTIONS = /(\d+) insertion/;
const RE_DELETIONS = /(\d+) deletion/;
const RE_REPO_NAME = /[/:]([^/]+\/[^/]+?)(?:\.git)?$/;

const execGit = async (
  args: readonly string[],
  cwd?: string
): Promise<string> => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `git ${args.join(" ")} failed (exit ${exitCode}): ${stderr}`
    );
  }
  return stdout;
};

const buildAuthUrl = (url: string, token?: string): string => {
  if (!(token && url.startsWith("https://"))) {
    return url;
  }
  return url.replace("https://", `https://${token}@`);
};

const parseRecord = (record: string): RawCommit => {
  const fields = record.split("\x00");
  const hash = fields[0] ?? "";
  const authorName = fields[1] ?? "";
  const authorEmail = fields[2] ?? "";
  const authorDate = fields[3] ?? "";
  const subject = fields[4] ?? "";
  const body = fields[5] ?? "";
  const parents = fields[6] ?? "";
  const refNames = fields[7] ?? "";
  return {
    hash,
    authorName,
    authorEmail,
    authorDate,
    subject,
    body,
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    refNames: refNames ? refNames.split(", ").filter(Boolean) : [],
  };
};

const parseLogOutput = (output: string): readonly RawCommit[] => {
  if (!output.trim()) {
    return [];
  }
  const records = output.split("\x01").filter(Boolean);
  return records.map(parseRecord);
};

const parseDiffStat = (output: string): CommitDiff => {
  const filesChangedMatch = RE_FILES_CHANGED.exec(output);
  const insertionsMatch = RE_INSERTIONS.exec(output);
  const deletionsMatch = RE_DELETIONS.exec(output);

  return {
    filesChanged: filesChangedMatch
      ? Number.parseInt(filesChangedMatch[1] ?? "0", 10)
      : 0,
    insertions: insertionsMatch
      ? Number.parseInt(insertionsMatch[1] ?? "0", 10)
      : 0,
    deletions: deletionsMatch
      ? Number.parseInt(deletionsMatch[1] ?? "0", 10)
      : 0,
  };
};

export const getRepoName = (url: string): string => {
  const match = RE_REPO_NAME.exec(url);
  if (!match) {
    throw new Error(`Cannot extract repo name from URL: ${url}`);
  }
  return match[1] ?? "";
};

export const cloneOrFetch = (
  config: GitConfig
): Effect.Effect<void, IngestionError> =>
  Effect.tryPromise({
    try: async () => {
      const isGitDir = await exists(`${config.localPath}/.git`);
      const authUrl = buildAuthUrl(config.url, config.authToken);

      if (isGitDir) {
        await execGit(["fetch", "--all"], config.localPath);
      } else {
        await execGit(["clone", "--bare", authUrl, config.localPath]);
      }
    },
    catch: (error) =>
      new IngestionError({
        message: error instanceof Error ? error.message : String(error),
        source: "git",
      }),
  });

export const getCommitLog = (
  config: GitConfig,
  sinceHash?: string
): Effect.Effect<readonly RawCommit[], IngestionError> =>
  Effect.tryPromise({
    try: async () => {
      const branch = config.branch || "--all";
      const range = sinceHash ? `${sinceHash}..HEAD` : undefined;

      const args: string[] = [
        "-C",
        config.localPath,
        "log",
        branch,
        `--format=${GIT_LOG_FORMAT}`,
      ];

      if (range) {
        args.push(range);
      }

      const output = await execGit(args, config.localPath);
      return parseLogOutput(output);
    },
    catch: (error) =>
      new IngestionError({
        message: error instanceof Error ? error.message : String(error),
        source: "git",
      }),
  });

export const getCommitDiff = (
  localPath: string,
  hash: string,
  parentCount: number
): Effect.Effect<CommitDiff, IngestionError> =>
  Effect.tryPromise({
    try: async () => {
      const parentHashes: string[] = [];
      for (let i = 0; i < parentCount; i++) {
        const parentHash = await execGit(
          ["rev-parse", `${hash}~${i}`],
          localPath
        );
        parentHashes.push(parentHash.trim());
      }

      const base = parentHashes[0] ?? hash;
      const output = await execGit(
        ["diff", "--shortstat", `${base}`, hash],
        localPath
      );

      return parseDiffStat(output);
    },
    catch: (error) =>
      new IngestionError({
        message: error instanceof Error ? error.message : String(error),
        source: "git",
      }),
  });
