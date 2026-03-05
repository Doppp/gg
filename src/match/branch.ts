import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";

export interface BranchPlan {
  matchId: string;
  provider: string;
  slug: string;
}

export interface AgentWorkspace {
  provider: string;
  branch: string;
  worktreePath: string;
}

export interface CreateAgentWorkspaceInput {
  repoPath: string;
  matchId: string;
  provider: string;
  slug: string;
  baseBranch: string;
  worktreeDir: string;
}

export function createMatchId(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `match_${year}${month}${day}_${hour}${minute}`;
}

export function slugifyPrompt(prompt: string): string {
  const slug = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? slug : "task";
}

export function buildMatchBranchName(plan: BranchPlan): string {
  return `gg/${plan.matchId}/${plan.provider}/${plan.slug}`;
}

function getWorktreePath(repoPath: string, worktreeDir: string, matchId: string, provider: string): string {
  return path.join(repoPath, worktreeDir, `${matchId}-${provider}`);
}

export async function createAgentWorkspace(input: CreateAgentWorkspaceInput): Promise<AgentWorkspace> {
  const git = simpleGit(input.repoPath);
  const branch = buildMatchBranchName({
    matchId: input.matchId,
    provider: input.provider,
    slug: input.slug
  });

  const worktreePath = getWorktreePath(input.repoPath, input.worktreeDir, input.matchId, input.provider);

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  await git.raw(["worktree", "add", "-b", branch, worktreePath, input.baseBranch]);

  return {
    provider: input.provider,
    branch,
    worktreePath
  };
}

export async function removeAgentWorkspace(repoPath: string, workspace: AgentWorkspace): Promise<void> {
  const git = simpleGit(repoPath);

  await git.raw(["worktree", "remove", "--force", workspace.worktreePath]);

  // Branch deletion can fail if already removed. This should not abort cleanup.
  await git.deleteLocalBranch(workspace.branch, true).catch(() => undefined);
}

export async function cleanupMatchWorkspaces(repoPath: string, workspaces: AgentWorkspace[]): Promise<void> {
  for (const workspace of workspaces) {
    await removeAgentWorkspace(repoPath, workspace);
  }
}
