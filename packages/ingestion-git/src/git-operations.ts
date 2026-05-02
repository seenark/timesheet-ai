import { IngestionError } from "@timesheet-ai/ingestion-core";
import { Effect } from "effect";
import type { CommitDiff, GitConfig, RawCommit } from "./types";

declare const Bun: typeof globalThis.Bun;

const GIT_LOG_FORMAT =
  "%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%P%x00%D%x00%x01";

const REPO_NAME_REGEX = /\/([^/]+?)(?:\.git)?$/;
const FILES_CHANGED_REGEX = /(\d+) files? changed/;
const INSERTIONS_REGEX = /(\d+) insertion/;
const DELETIONS_REGEX = /(\d+) deletion/;

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
  if (!token) {
    return url;
  }
  if (url.startsWith("https://")) {
    return url.replace("https://", `https://${token}@`);
  }
  return url;
};

const extractRepoName = (url: string): string => {
  const match = url.match(REPO_NAME_REGEX);
  return match?.[1] ?? url;
};

export const cloneOrFetch = (
  config: GitConfig
): Effect.Effect<void, IngestionError> =>
  Effect.tryPromise({
    catch: (error) =>
      new IngestionError({
        message: `Git clone/fetch failed: ${String(error)}`,
        source: "git",
      }),
    try: async () => {
      const authUrl = buildAuthUrl(config.url, config.authToken);

      try {
        await execGit([
          "--git-dir",
          config.localPath,
          "rev-parse",
          "--git-dir",
        ]);
        await execGit(["--git-dir", config.localPath, "fetch", "--all"]);
      } catch {
        await execGit(["clone", "--bare", authUrl, config.localPath]);
      }
    },
  });

export const getCommitLog = (
  config: GitConfig,
  sinceHash?: string
): Effect.Effect<readonly RawCommit[], IngestionError> =>
  Effect.tryPromise({
    catch: (error) =>
      new IngestionError({
        message: `Git log failed: ${String(error)}`,
        source: "git",
      }),
    try: async () => {
      const args = [
        "--git-dir",
        config.localPath,
        "log",
        `--format=${GIT_LOG_FORMAT}`,
      ];

      if (sinceHash) {
        args.push(`${sinceHash}..HEAD`);
      }

      if (config.branch) {
        args.push(config.branch);
      } else {
        args.push("--all");
      }

      const output = await execGit(args);
      return parseLogOutput(output);
    },
  });

const parseLogOutput = (output: string): RawCommit[] => {
  if (!output.trim()) {
    return [];
  }

  const records = output.split("\x01").filter((r) => r.trim());
  return records.map(parseRecord).filter((c): c is RawCommit => c !== null);
};

const parseRecord = (record: string): RawCommit | null => {
  const parts = record.split("\x00");
  if (parts.length < 8) {
    return null;
  }

  const parentLine = parts[6]?.trim() ?? "";
  const parents = parentLine
    ? parentLine.split(" ").filter((p) => p.trim())
    : [];

  return {
    hash: parts[0]?.trim() ?? "",
    authorName: parts[1]?.trim() ?? "",
    authorEmail: parts[2]?.trim() ?? "",
    authorDate: parts[3]?.trim() ?? "",
    subject: parts[4]?.trim() ?? "",
    body: parts[5]?.trim() ?? "",
    parents,
    refNames: parts[7]?.trim()
      ? (parts[7]?.split(",").map((r) => r.trim()) ?? [])
      : [],
  };
};

export const getCommitDiff = (
  localPath: string,
  hash: string,
  parentCount: number
): Effect.Effect<CommitDiff, IngestionError> =>
  Effect.tryPromise({
    catch: () =>
      new IngestionError({
        message: `Git diff failed for ${hash}`,
        source: "git",
      }),
    try: async () => {
      const parentRef = parentCount > 1 ? `${hash}^1` : `${hash}^`;
      let output: string;
      try {
        output = await execGit([
          "--git-dir",
          localPath,
          "diff",
          "--shortstat",
          parentRef,
          hash,
        ]);
      } catch {
        return { filesChanged: 0, insertions: 0, deletions: 0 };
      }
      return parseDiffStat(output);
    },
  });

const parseDiffStat = (output: string): CommitDiff => {
  const filesMatch = output.match(FILES_CHANGED_REGEX);
  const insertionsMatch = output.match(INSERTIONS_REGEX);
  const deletionsMatch = output.match(DELETIONS_REGEX);

  return {
    filesChanged: filesMatch ? Number.parseInt(filesMatch[1] ?? "0", 10) : 0,
    insertions: insertionsMatch
      ? Number.parseInt(insertionsMatch[1] ?? "0", 10)
      : 0,
    deletions: deletionsMatch
      ? Number.parseInt(deletionsMatch[1] ?? "0", 10)
      : 0,
  };
};

export const getRepoName = (url: string): string => extractRepoName(url);
