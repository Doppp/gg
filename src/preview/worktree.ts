import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import { listWorktrees } from "../lib/git.js";

export interface PreviewSwitchInput {
  repoPath: string;
  previewPath: string;
  baseBranch: string;
  targetBranch: string;
}

export async function ensurePreviewWorktree(repoPath: string, previewPath: string, baseBranch: string): Promise<void> {
  const git = simpleGit(repoPath);
  const existingWorktrees = await listWorktrees(repoPath);
  const normalizedPreviewPath = path.resolve(previewPath);
  const previewExistsInGit = existingWorktrees.some((worktree) => path.resolve(worktree) === normalizedPreviewPath);

  if (!previewExistsInGit) {
    if (fs.existsSync(previewPath) && fs.readdirSync(previewPath).length > 0) {
      throw new Error(`Preview worktree path exists but is not registered: ${previewPath}`);
    }
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    await git.raw(["worktree", "add", "--detach", previewPath, baseBranch]);
    return;
  }

  // When the worktree is registered but missing on disk, recreate it.
  if (!fs.existsSync(previewPath)) {
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    await git.raw(["worktree", "add", "--force", "--detach", previewPath, baseBranch]);
  }
}

export async function switchPreviewBranch(input: PreviewSwitchInput): Promise<void> {
  await ensurePreviewWorktree(input.repoPath, input.previewPath, input.baseBranch);
  const previewGit = simpleGit(input.previewPath);
  await previewGit.checkout(input.targetBranch);
}
