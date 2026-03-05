import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { switchPreviewBranch } from "../src/preview/worktree.js";
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

describe("preview worktree", () => {
  it("switches preview branch without mutating main working directory", async () => {
    const repoPath = createTempDir("gg-phase2-preview-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);

    execSync("git checkout -b feature-preview", { cwd: repoPath, stdio: "pipe" });
    fs.writeFileSync(path.join(repoPath, "feature.txt"), "feature\n", "utf8");
    execSync("git add feature.txt", { cwd: repoPath, stdio: "pipe" });
    execSync("git commit -m \"feature\"", { cwd: repoPath, stdio: "pipe" });
    execSync("git checkout main", { cwd: repoPath, stdio: "pipe" });

    const previewPath = path.join(repoPath, ".gg-worktrees", "preview");

    await switchPreviewBranch({
      repoPath,
      previewPath,
      baseBranch: "main",
      targetBranch: "feature-preview"
    });

    expect(fs.existsSync(previewPath)).toBe(true);
    expect(gitOutput(previewPath, "git branch --show-current")).toBe("feature-preview");
    expect(gitOutput(repoPath, "git branch --show-current")).toBe("main");
  });
});
