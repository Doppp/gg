import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMatchBranchName,
  cleanupMatchWorkspaces,
  createAgentWorkspace,
  createMatchId,
  slugifyPrompt
} from "../src/match/branch.js";
import { createTempDir, gitOutput, initGitRepo } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("match branch/worktree lifecycle", () => {
  it("creates and cleans up agent worktrees", async () => {
    const repoPath = createTempDir("gg-phase2-branch-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);

    const workspace = await createAgentWorkspace({
      repoPath,
      matchId: "match_20260305_1530",
      provider: "codex",
      slug: "dark-mode-toggle",
      baseBranch: "main",
      worktreeDir: ".gg-worktrees"
    });

    expect(workspace.branch).toBe("gg/match_20260305_1530/codex/dark-mode-toggle");
    expect(fs.existsSync(workspace.worktreePath)).toBe(true);

    const branches = gitOutput(repoPath, "git branch --list");
    expect(branches).toContain("gg/match_20260305_1530/codex/dark-mode-toggle");

    await cleanupMatchWorkspaces(repoPath, [workspace]);

    const branchesAfter = gitOutput(repoPath, "git branch --list");
    expect(branchesAfter).not.toContain("gg/match_20260305_1530/codex/dark-mode-toggle");
    expect(fs.existsSync(workspace.worktreePath)).toBe(false);
  });

  it("generates deterministic ids and prompt slugs", () => {
    expect(createMatchId(new Date(2026, 2, 5, 15, 30, 0))).toBe("match_20260305_1530");
    expect(slugifyPrompt("Add Dark Mode Toggle to Settings Page!")).toBe("add-dark-mode-toggle-to-settings-page");
    expect(buildMatchBranchName({ matchId: "match_1", provider: "claude", slug: "task" })).toBe(
      "gg/match_1/claude/task"
    );
  });
});
