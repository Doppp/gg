import { simpleGit } from "simple-git";
import type { AgentEntry, AgentMatchStats, Match, MatchStats } from "./types.js";

export interface RuntimeAgentMetrics {
  startedAt?: Date;
  firstOutputAt?: Date;
  completedAt?: Date;
  totalOutputChars: number;
}

export interface GitAgentDiffStats {
  filesChanged: number;
  filesAdded: number;
  filesDeleted: number;
  insertions: number;
  deletions: number;
  netLines: number;
  commits: number;
}

function toAgentStats(agent: AgentEntry): AgentMatchStats {
  return {
    agentId: agent.id,
    provider: agent.provider,
    model: agent.model,
    branch: agent.branch,
    timeToFirstOutput: 0,
    timeToCompletion: 0,
    timeRemaining: 0,
    filesChanged: 0,
    filesAdded: 0,
    filesDeleted: 0,
    insertions: 0,
    deletions: 0,
    netLines: 0,
    commits: 0,
    tokensUsed: agent.tokensUsed,
    costUSD: agent.costUSD,
    costPerFile: 0,
    tokensPerLine: 0,
    totalOutputChars: 0,
    riskFlags: [...agent.riskFlags],
    checksResults: []
  };
}

export function buildInitialMatchStats(match: Match): MatchStats {
  return {
    matchId: match.id,
    prompt: match.prompt,
    duration: 0,
    agentStats: match.agents.map((agent) => toAgentStats(agent))
  };
}

function parseNumStat(output: string): { filesChanged: number; insertions: number; deletions: number } {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  for (const line of lines) {
    const parts = line.split(/\t+/);
    if (parts.length < 3) {
      continue;
    }

    filesChanged += 1;
    const ins = parts[0] === "-" ? 0 : Number(parts[0]);
    const del = parts[1] === "-" ? 0 : Number(parts[1]);
    if (Number.isFinite(ins)) {
      insertions += ins;
    }
    if (Number.isFinite(del)) {
      deletions += del;
    }
  }

  return {
    filesChanged,
    insertions,
    deletions
  };
}

function parseNameStatus(output: string): { filesAdded: number; filesDeleted: number } {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let filesAdded = 0;
  let filesDeleted = 0;

  for (const line of lines) {
    const status = line.split(/\s+/)[0];
    if (status === "A") {
      filesAdded += 1;
    }
    if (status === "D") {
      filesDeleted += 1;
    }
  }

  return { filesAdded, filesDeleted };
}

export async function collectGitDiffStats(repoPath: string, baseBranch: string, branch: string): Promise<GitAgentDiffStats> {
  const git = simpleGit(repoPath);
  const range = `${baseBranch}..${branch}`;

  const [numStatRaw, nameStatusRaw, commitsRaw] = await Promise.all([
    git.raw(["diff", "--numstat", range]),
    git.raw(["diff", "--name-status", range]),
    git.raw(["rev-list", "--count", range])
  ]);

  const numStat = parseNumStat(numStatRaw);
  const nameStatus = parseNameStatus(nameStatusRaw);
  const commits = Number(commitsRaw.trim()) || 0;

  return {
    filesChanged: numStat.filesChanged,
    filesAdded: nameStatus.filesAdded,
    filesDeleted: nameStatus.filesDeleted,
    insertions: numStat.insertions,
    deletions: numStat.deletions,
    netLines: numStat.insertions - numStat.deletions,
    commits
  };
}

function secondsBetween(start?: Date, end?: Date): number {
  if (!start || !end) {
    return 0;
  }
  return Math.max(0, (end.getTime() - start.getTime()) / 1000);
}

export function finalizeAgentStats(
  agent: AgentEntry,
  runtimeMetrics: RuntimeAgentMetrics,
  gitStats: GitAgentDiffStats,
  timeLimitSeconds?: number
): AgentMatchStats {
  const timeToCompletion = secondsBetween(runtimeMetrics.startedAt, runtimeMetrics.completedAt);
  const timeToFirstOutput = secondsBetween(runtimeMetrics.startedAt, runtimeMetrics.firstOutputAt);
  const timeRemaining = timeLimitSeconds ? Math.max(0, timeLimitSeconds - timeToCompletion) : 0;
  const filesChanged = gitStats.filesChanged;
  const netLinesAbs = Math.max(1, Math.abs(gitStats.netLines));

  return {
    agentId: agent.id,
    provider: agent.provider,
    model: agent.model,
    branch: agent.branch,
    timeToFirstOutput,
    timeToCompletion,
    timeRemaining,
    filesChanged,
    filesAdded: gitStats.filesAdded,
    filesDeleted: gitStats.filesDeleted,
    insertions: gitStats.insertions,
    deletions: gitStats.deletions,
    netLines: gitStats.netLines,
    commits: gitStats.commits,
    tokensUsed: agent.tokensUsed,
    costUSD: agent.costUSD,
    costPerFile: filesChanged > 0 ? agent.costUSD / filesChanged : 0,
    tokensPerLine: agent.tokensUsed / netLinesAbs,
    totalOutputChars: runtimeMetrics.totalOutputChars,
    riskFlags: [...agent.riskFlags],
    checksResults: agent.status === "completed" || agent.status === "failed" || agent.status === "timeout" ? [] : []
  };
}

export function finalizeMatchStats(match: Match, agentStats: AgentMatchStats[]): MatchStats {
  const duration = match.endedAt
    ? Math.max(0, (match.endedAt.getTime() - match.startedAt.getTime()) / 1000)
    : 0;

  return {
    matchId: match.id,
    prompt: match.prompt,
    duration,
    agentStats
  };
}
