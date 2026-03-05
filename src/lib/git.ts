import path from "node:path";
import { simpleGit } from "simple-git";

export async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    const git = simpleGit(repoPath);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const branchSummary = await git.branchLocal();
  return branchSummary.current;
}

export async function isWorkingTreeClean(repoPath: string): Promise<boolean> {
  const git = simpleGit(repoPath);
  const status = await git.status();
  return status.isClean();
}

export function getRepoName(repoPath: string): string {
  return path.basename(repoPath);
}

export interface RepoValidationResult {
  isGitRepo: boolean;
  isClean: boolean;
  currentBranch: string;
  changedFiles: string[];
}

export async function validateRepo(repoPath: string): Promise<RepoValidationResult> {
  const isGitRepo = await isGitRepository(repoPath);
  if (!isGitRepo) {
    return {
      isGitRepo: false,
      isClean: false,
      currentBranch: "",
      changedFiles: []
    };
  }

  const git = simpleGit(repoPath);
  const [branchSummary, status] = await Promise.all([git.branchLocal(), git.status()]);

  return {
    isGitRepo: true,
    isClean: status.isClean(),
    currentBranch: branchSummary.current,
    changedFiles: status.files.map((file) => file.path)
  };
}

export async function listLocalBranches(repoPath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  const summary = await git.branchLocal();
  return summary.all;
}

export async function listWorktrees(repoPath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  const output = await git.raw(["worktree", "list", "--porcelain"]);

  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter((line) => line.length > 0);
}
