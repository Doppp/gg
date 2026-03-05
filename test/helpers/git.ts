import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function initGitRepo(repoPath: string): void {
  execSync("git init -b main", { cwd: repoPath, stdio: "pipe" });
  execSync("git config user.email test@example.com", { cwd: repoPath, stdio: "pipe" });
  execSync("git config user.name Test User", { cwd: repoPath, stdio: "pipe" });

  fs.writeFileSync(path.join(repoPath, "README.md"), "# test\n", "utf8");
  execSync("git add README.md", { cwd: repoPath, stdio: "pipe" });
  execSync("git commit -m \"init\"", { cwd: repoPath, stdio: "pipe" });
}

export function gitOutput(repoPath: string, cmd: string): string {
  return execSync(cmd, { cwd: repoPath, stdio: "pipe" }).toString("utf8").trim();
}
