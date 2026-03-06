import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMatchBranchName,
  buildUserBaseBranchName,
  createMatchBaseBranch,
  slugifyBaseBranchTheme,
  suggestBaseBranchTheme
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

describe("buildMatchBranchName", () => {
  it("builds namespaced branch names", () => {
    expect(
      buildMatchBranchName({
        matchId: "match_20260305_1530",
        provider: "codex",
        slug: "dark-mode-toggle"
      })
    ).toBe("gg/match_20260305_1530/codex/dark-mode-toggle");
  });

  it("creates user-facing base branches with short themed names", async () => {
    const repoPath = createTempDir("gg-base-branch-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);

    expect(slugifyBaseBranchTheme("Dark Mode Toggle")).toBe("dark-mode-to");
    expect(suggestBaseBranchTheme("Add dark mode toggle to settings page")).toBe("add-dark-mod");
    expect(buildUserBaseBranchName("dark mode")).toBe("feat/dark-mode");

    const created = await createMatchBaseBranch({
      repoPath,
      sourceBranch: "main",
      theme: "dark mode"
    });

    expect(created.branch).toBe("feat/dark-mode");
    expect(gitOutput(repoPath, "git branch --list")).toContain("feat/dark-mode");
    expect(gitOutput(repoPath, "git branch --show-current")).toBe("main");
  });
});
