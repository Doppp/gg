export interface CheckResult {
  name: string;
  passed: boolean;
  outputPath?: string;
}

export type CheckResults = Record<string, CheckResult[]>;

export type PromptStrategy = "plain" | "competition";

export interface Match {
  id: string; // e.g. "match_20260305_1530"
  prompt: string;
  effectivePrompt: string;
  promptStrategy: PromptStrategy;
  repo: string; // Absolute path to the git repo
  baseBranch: string; // Branch match started from
  agents: AgentEntry[];
  status: MatchStatus;
  startedAt: Date;
  endedAt?: Date;
  winnerId?: string;
  mergedBranch?: string;
  stats: MatchStats;
  checks?: CheckResults; // Quality check results per agent
  privacy: "public" | "private" | "anonymous";
  logDir: string; // disk directory for match artifacts
}

export type MatchStatus =
  | "setup"
  | "branching"
  | "running"
  | "reviewing"
  | "decided"
  | "merged"
  | "cancelled";

export interface AgentEntry {
  id: string; // e.g. "claude-1"
  provider: string; // "claude" | "codex" | "copilot" | "devin" | ...
  model?: string;
  branch: string; // e.g. "gg/match_.../claude/dark-mode"
  worktreePath: string; // Absolute path to agent worktree
  status: AgentMatchStatus;
  pid?: number;
  startedAt?: Date;
  completedAt?: Date;
  tokensUsed: number;
  costUSD: number;
  logPath: string; // raw stdout/stderr file path
  threadPath: string; // structured thread json path
  riskFlags: string[];
}

export type AgentMatchStatus =
  | "waiting"
  | "spawning"
  | "running"
  | "completed"
  | "failed"
  | "timeout";

export interface MatchStats {
  matchId: string;
  prompt: string;
  duration: number; // seconds
  agentStats: AgentMatchStats[];
}

export interface AgentMatchStats {
  agentId: string;
  provider: string;
  model?: string;
  branch: string;

  outcome?: "winner" | "loser" | "dnf";

  // Speed
  timeToFirstOutput: number;
  timeToCompletion: number;
  timeRemaining: number;

  // Git changes
  filesChanged: number;
  filesAdded: number;
  filesDeleted: number;
  insertions: number;
  deletions: number;
  netLines: number;
  commits: number;

  // Efficiency
  tokensUsed: number;
  costUSD: number;
  costPerFile: number;
  tokensPerLine: number;

  // Output
  totalOutputChars: number;

  // Safety
  riskFlags: string[];

  // Checks
  checksResults?: {
    name: string;
    passed: boolean;
    outputPath?: string; // optional file path for full check output
  }[];
}

export interface MatchThread {
  matchId: string;
  agentId: string;
  provider: string;
  prompt: string;
  effectivePrompt: string;
  promptStrategy: PromptStrategy;
  events: ThreadEvent[];
}

export type ThreadEvent =
  | { type: "prompt"; timestamp: string; content: string }
  | { type: "effective_prompt"; timestamp: string; content: string; strategy: PromptStrategy }
  | { type: "agent_started"; timestamp: string; pid: number }
  | { type: "stdout"; timestamp: string; content: string }
  | { type: "stderr"; timestamp: string; content: string }
  | {
      type: "file_modified";
      timestamp: string;
      path: string;
      insertions: number;
      deletions: number;
    }
  | { type: "file_created"; timestamp: string; path: string }
  | { type: "file_deleted"; timestamp: string; path: string }
  | { type: "command_executed"; timestamp: string; command: string }
  | { type: "risk_flag"; timestamp: string; reason: string; path?: string }
  | { type: "check_result"; timestamp: string; name: string; passed: boolean; output?: string }
  | { type: "agent_exited"; timestamp: string; code: number; signal?: string };

export interface AgentProfile {
  provider: string;
  model?: string;
  matches: number;
  wins: number;
  losses: number;
  dnfs: number;
  winRate: number;
  avgTimeToCompletion: number;
  avgFilesChanged: number;
  avgInsertions: number;
  avgTokensUsed: number;
  avgCostPerMatch: number;
  totalTokens: number;
  totalCostUSD: number;
  currentStreak: number;
  bestStreak: number;
  headToHead: Record<string, { wins: number; losses: number }>;
}

export interface MatchRecord {
  matchId: string;
  privacy: "public" | "private" | "anonymous";
  repo: string | null;
  prompt: string | null;
  agents: string[];
  winner: string | null;
  durationSeconds: number;
  agentStats: {
    provider: string;
    model?: string;
    timeToCompletion: number;
    filesChanged: number;
    insertions: number;
    deletions: number;
    tokensUsed: number;
    costUSD: number;
    checksPassed?: boolean;
    riskFlags: string[];
  }[];
  timestamp: string; // ISO 8601
}
