import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { scanRecoveryState } from "../src/recovery/recovery.js";
import { createTempDir, initGitRepo } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("recovery scanning", () => {
  it("detects dangling branches, orphaned worktrees, and unfinished matches", async () => {
    const repoPath = createTempDir("gg-phase2-recovery-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);

    execSync("git branch gg/match_20260305_1530/codex/task", { cwd: repoPath, stdio: "pipe" });

    const orphanPath = path.join(repoPath, ".gg-worktrees", "match_20260305_1530-claude");
    fs.mkdirSync(orphanPath, { recursive: true });

    const dbPath = path.join(repoPath, "recovery-test.db");
    const db = new Database(dbPath);
    db.exec(
      "CREATE TABLE matches (id TEXT PRIMARY KEY, status TEXT NOT NULL, started_at DATETIME NOT NULL);" +
        "INSERT INTO matches (id, status, started_at) VALUES ('match_20260305_1530', 'running', datetime('now'));"
    );
    db.close();

    const result = await scanRecoveryState({
      repoPath,
      worktreeDir: ".gg-worktrees",
      dbPath
    });

    expect(result.danglingBranches).toContain("gg/match_20260305_1530/codex/task");
    expect(result.orphanedWorktrees).toContain(orphanPath);
    expect(result.unfinishedMatches).toContain("match_20260305_1530");
  });
});
