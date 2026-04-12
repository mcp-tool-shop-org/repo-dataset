/** Git CLI wrapper — shells out to git */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RepoDatasetError, ErrorCodes } from "../errors.js";
import type { CommitInfo } from "../types.js";

const exec = promisify(execFile);

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--git-dir"], { cwd: path });
    return true;
  } catch {
    return false;
  }
}

export async function gitLog(
  repoPath: string,
  count: number
): Promise<CommitInfo[]> {
  const separator = "---COMMIT-SEP---";
  const format = `%H%n%s%n%an%n%aI%n${separator}`;

  try {
    const { stdout } = await exec(
      "git",
      ["log", `--max-count=${count}`, `--pretty=format:${format}`, "--name-only"],
      { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 }
    );

    const commits: CommitInfo[] = [];
    const blocks = stdout.split(separator).filter((b) => b.trim());

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 4) continue;

      const sha = lines[0];
      const message = lines[1];
      const author = lines[2];
      const date = lines[3];
      // Remaining lines (after empty line) are file names
      const emptyIdx = lines.indexOf("", 4);
      const files = emptyIdx >= 0
        ? lines.slice(emptyIdx + 1).filter((f) => f.trim())
        : lines.slice(4).filter((f) => f.trim());

      commits.push({ sha, message, author, date, files, diff: "" });
    }

    return commits;
  } catch {
    // No commits yet or git error — return empty
    return [];
  }
}

export async function gitDiff(
  repoPath: string,
  sha: string
): Promise<string> {
  try {
    const { stdout } = await exec(
      "git",
      ["show", "--patch", "--no-color", sha],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
    );
    return stdout;
  } catch {
    return "";
  }
}

export async function gitClone(
  url: string,
  targetDir: string
): Promise<void> {
  try {
    await exec("git", ["clone", "--depth=100", url, targetDir], {
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    throw new RepoDatasetError(
      ErrorCodes.CLONE_FAILED,
      `Failed to clone ${url}`,
      "Check that the URL is accessible and git is installed"
    );
  }
}
