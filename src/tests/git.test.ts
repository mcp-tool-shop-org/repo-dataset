import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { isGitRepo, gitLog, gitDiff, gitClone, getHeadSha } from "../discovery/git.js";
import { RepoDatasetError } from "../errors.js";

function gitExec(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" });
}

describe("git", () => {
  let tempRepo: string;
  let nonGitDir: string;

  before(async () => {
    // Create a temp git repo with multiple commits
    tempRepo = await mkdtemp(join(tmpdir(), "git-test-repo-"));
    gitExec(["init"], tempRepo);
    gitExec(["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "--allow-empty", "-m", "initial commit"], tempRepo);

    await writeFile(join(tempRepo, "hello.ts"), "export const x = 1;");
    gitExec(["add", "-A"], tempRepo);
    gitExec(["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", "add hello.ts with constant"], tempRepo);

    await writeFile(join(tempRepo, "hello.ts"), "export const x = 2;\nexport const y = 3;");
    gitExec(["add", "-A"], tempRepo);
    gitExec(["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", "update hello.ts values"], tempRepo);

    // Create non-git directory
    nonGitDir = await mkdtemp(join(tmpdir(), "git-test-noGit-"));
  });

  after(async () => {
    await rm(tempRepo, { recursive: true, force: true });
    await rm(nonGitDir, { recursive: true, force: true });
  });

  describe("isGitRepo", () => {
    it("returns true for git repos", async () => {
      const result = await isGitRepo(tempRepo);
      assert.equal(result, true);
    });

    it("returns false for non-git dirs", async () => {
      const result = await isGitRepo(nonGitDir);
      assert.equal(result, false);
    });
  });

  describe("gitLog", () => {
    it("returns commits with expected shape", async () => {
      const commits = await gitLog(tempRepo, 10);
      assert.ok(commits.length >= 2, `Expected >= 2 commits, got ${commits.length}`);
      const commit = commits[0];
      assert.ok(typeof commit.sha === "string" && commit.sha.length > 0);
      assert.ok(typeof commit.message === "string" && commit.message.length > 0);
      assert.ok(typeof commit.author === "string");
      assert.ok(typeof commit.date === "string");
    });

    it("respects count limit", async () => {
      const commits = await gitLog(tempRepo, 1);
      assert.equal(commits.length, 1);
    });

    it("returns empty array for no-commit repos", async () => {
      const emptyRepo = await mkdtemp(join(tmpdir(), "git-test-empty-"));
      gitExec(["init"], emptyRepo);
      const commits = await gitLog(emptyRepo, 10);
      assert.deepEqual(commits, []);
      await rm(emptyRepo, { recursive: true, force: true });
    });
  });

  describe("gitDiff", () => {
    it("returns patch content for a known commit", async () => {
      const commits = await gitLog(tempRepo, 10);
      // Use the most recent commit which should have a diff
      assert.ok(commits.length > 0, "Should have commits");
      const commit = commits[0];
      const diff = await gitDiff(tempRepo, commit.sha);
      assert.ok(diff.length > 0, "Diff should not be empty");
    });

    it("returns empty string on error", async () => {
      const diff = await gitDiff(tempRepo, "0000000000000000000000000000000000000000");
      assert.equal(diff, "");
    });
  });

  describe("getHeadSha", () => {
    it("returns sha for repo with commits", async () => {
      const sha = await getHeadSha(tempRepo);
      assert.ok(sha, "Should return a sha");
      assert.equal(sha!.length, 40, "SHA should be 40 hex chars");
      assert.ok(/^[0-9a-f]{40}$/.test(sha!), "Should be hex");
    });

    it("returns null for no-commit repo", async () => {
      const emptyRepo = await mkdtemp(join(tmpdir(), "git-test-nocommit-"));
      gitExec(["init"], emptyRepo);
      const sha = await getHeadSha(emptyRepo);
      assert.equal(sha, null, "Should return null for repo with no commits");
      await rm(emptyRepo, { recursive: true, force: true });
    });
  });

  describe("gitClone", () => {
    it("throws RepoDatasetError on bad URL", async () => {
      const target = join(tmpdir(), "clone-fail-" + Date.now());
      await assert.rejects(
        () => gitClone("https://invalid.example/repo.git", target),
        (err: unknown) => {
          assert.ok(err instanceof RepoDatasetError);
          assert.equal(err.code, "CLONE_FAILED");
          return true;
        }
      );
    });
  });
});
