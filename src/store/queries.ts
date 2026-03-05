import type Database from "better-sqlite3";
import type { AgentMatchStats, AgentProfile, Match } from "../match/types.js";

export interface MatchListItem {
  id: string;
  prompt: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  winnerId: string | null;
}

export interface LeaderboardRow {
  provider: string;
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
}

interface StoredProfileRow {
  provider: string;
  model: string | null;
  matches: number;
  wins: number;
  losses: number;
  dnfs: number;
  win_rate: number;
  avg_time: number;
  avg_files: number;
  avg_insertions: number;
  avg_tokens: number;
  avg_cost: number;
  total_tokens: number;
  total_cost: number;
  current_streak: number;
  best_streak: number;
  head_to_head: string | null;
}

function parseHeadToHead(value: string | null): Record<string, { wins: number; losses: number }> {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value) as Record<string, { wins: number; losses: number }>;
  } catch {
    return {};
  }
}

function toAgentProfile(row: StoredProfileRow): AgentProfile {
  return {
    provider: row.provider,
    model: row.model ?? undefined,
    matches: row.matches,
    wins: row.wins,
    losses: row.losses,
    dnfs: row.dnfs,
    winRate: row.win_rate,
    avgTimeToCompletion: row.avg_time,
    avgFilesChanged: row.avg_files,
    avgInsertions: row.avg_insertions,
    avgTokensUsed: row.avg_tokens,
    avgCostPerMatch: row.avg_cost,
    totalTokens: row.total_tokens,
    totalCostUSD: row.total_cost,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    headToHead: parseHeadToHead(row.head_to_head)
  };
}

function computeOutcomeCounts(stat: AgentMatchStats): { win: number; loss: number; dnf: number } {
  if (stat.outcome === "winner") {
    return { win: 1, loss: 0, dnf: 0 };
  }
  if (stat.outcome === "dnf") {
    return { win: 0, loss: 0, dnf: 1 };
  }
  return { win: 0, loss: 1, dnf: 0 };
}

function updateRunningAverage(previousAvg: number, previousCount: number, nextValue: number): number {
  const nextCount = previousCount + 1;
  return (previousAvg * previousCount + nextValue) / nextCount;
}

function updateHeadToHeadMap(
  current: Record<string, { wins: number; losses: number }>,
  selfProvider: string,
  selfOutcome: AgentMatchStats["outcome"],
  allStats: AgentMatchStats[]
): Record<string, { wins: number; losses: number }> {
  const out = { ...current };

  for (const opponent of allStats) {
    if (opponent.provider === selfProvider) {
      continue;
    }

    const key = opponent.provider;
    const existing = out[key] ?? { wins: 0, losses: 0 };

    if (selfOutcome === "winner") {
      existing.wins += 1;
    } else if (opponent.outcome === "winner") {
      existing.losses += 1;
    }

    out[key] = existing;
  }

  return out;
}

export function persistMatch(db: Database.Database, match: Match): void {
  const insertMatch = db.prepare(
    `INSERT INTO matches (
      id, prompt, repo, base_branch, status, privacy,
      started_at, ended_at, duration, winner_id, merged_branch, log_dir
    ) VALUES (
      @id, @prompt, @repo, @base_branch, @status, @privacy,
      @started_at, @ended_at, @duration, @winner_id, @merged_branch, @log_dir
    )
    ON CONFLICT(id) DO UPDATE SET
      prompt = excluded.prompt,
      repo = excluded.repo,
      base_branch = excluded.base_branch,
      status = excluded.status,
      privacy = excluded.privacy,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      duration = excluded.duration,
      winner_id = excluded.winner_id,
      merged_branch = excluded.merged_branch,
      log_dir = excluded.log_dir`
  );

  const insertAgent = db.prepare(
    `INSERT INTO match_agents (
      id, match_id, provider, model, branch, status, outcome,
      time_to_first, time_to_done, time_remaining,
      files_changed, files_added, files_deleted, insertions, deletions, net_lines, commits,
      tokens_used, cost_usd, output_chars,
      risk_flags, checks_results,
      log_path, thread_path
    ) VALUES (
      @id, @match_id, @provider, @model, @branch, @status, @outcome,
      @time_to_first, @time_to_done, @time_remaining,
      @files_changed, @files_added, @files_deleted, @insertions, @deletions, @net_lines, @commits,
      @tokens_used, @cost_usd, @output_chars,
      @risk_flags, @checks_results,
      @log_path, @thread_path
    )
    ON CONFLICT(id) DO UPDATE SET
      match_id = excluded.match_id,
      provider = excluded.provider,
      model = excluded.model,
      branch = excluded.branch,
      status = excluded.status,
      outcome = excluded.outcome,
      time_to_first = excluded.time_to_first,
      time_to_done = excluded.time_to_done,
      time_remaining = excluded.time_remaining,
      files_changed = excluded.files_changed,
      files_added = excluded.files_added,
      files_deleted = excluded.files_deleted,
      insertions = excluded.insertions,
      deletions = excluded.deletions,
      net_lines = excluded.net_lines,
      commits = excluded.commits,
      tokens_used = excluded.tokens_used,
      cost_usd = excluded.cost_usd,
      output_chars = excluded.output_chars,
      risk_flags = excluded.risk_flags,
      checks_results = excluded.checks_results,
      log_path = excluded.log_path,
      thread_path = excluded.thread_path`
  );

  const transaction = db.transaction(() => {
    insertMatch.run({
      id: match.id,
      prompt: match.prompt,
      repo: match.repo,
      base_branch: match.baseBranch,
      status: match.status,
      privacy: match.privacy,
      started_at: match.startedAt.toISOString(),
      ended_at: match.endedAt ? match.endedAt.toISOString() : null,
      duration: match.stats.duration,
      winner_id: match.winnerId ?? null,
      merged_branch: match.mergedBranch ?? null,
      log_dir: match.logDir
    });

    for (const agent of match.agents) {
      const stat = match.stats.agentStats.find((candidate) => candidate.agentId === agent.id);

      insertAgent.run({
        id: agent.id,
        match_id: match.id,
        provider: agent.provider,
        model: agent.model ?? null,
        branch: agent.branch,
        status: agent.status,
        outcome: stat?.outcome ?? null,
        time_to_first: stat?.timeToFirstOutput ?? 0,
        time_to_done: stat?.timeToCompletion ?? 0,
        time_remaining: stat?.timeRemaining ?? 0,
        files_changed: stat?.filesChanged ?? 0,
        files_added: stat?.filesAdded ?? 0,
        files_deleted: stat?.filesDeleted ?? 0,
        insertions: stat?.insertions ?? 0,
        deletions: stat?.deletions ?? 0,
        net_lines: stat?.netLines ?? 0,
        commits: stat?.commits ?? 0,
        tokens_used: stat?.tokensUsed ?? 0,
        cost_usd: stat?.costUSD ?? 0,
        output_chars: stat?.totalOutputChars ?? 0,
        risk_flags: JSON.stringify(stat?.riskFlags ?? agent.riskFlags ?? []),
        checks_results: JSON.stringify(stat?.checksResults ?? []),
        log_path: agent.logPath,
        thread_path: agent.threadPath
      });
    }
  });

  transaction();

  recomputeProfiles(db, match.stats.agentStats);
}

function recomputeProfiles(db: Database.Database, stats: AgentMatchStats[]): void {
  const selectProfile = db.prepare("SELECT * FROM agent_profiles WHERE provider = ?") as Database.Statement<[string], StoredProfileRow | undefined>;

  const upsertProfile = db.prepare(
    `INSERT INTO agent_profiles (
      provider, model, matches, wins, losses, dnfs, win_rate,
      avg_time, avg_files, avg_insertions, avg_tokens, avg_cost,
      total_tokens, total_cost, current_streak, best_streak, head_to_head
    ) VALUES (
      @provider, @model, @matches, @wins, @losses, @dnfs, @win_rate,
      @avg_time, @avg_files, @avg_insertions, @avg_tokens, @avg_cost,
      @total_tokens, @total_cost, @current_streak, @best_streak, @head_to_head
    )
    ON CONFLICT(provider) DO UPDATE SET
      model = excluded.model,
      matches = excluded.matches,
      wins = excluded.wins,
      losses = excluded.losses,
      dnfs = excluded.dnfs,
      win_rate = excluded.win_rate,
      avg_time = excluded.avg_time,
      avg_files = excluded.avg_files,
      avg_insertions = excluded.avg_insertions,
      avg_tokens = excluded.avg_tokens,
      avg_cost = excluded.avg_cost,
      total_tokens = excluded.total_tokens,
      total_cost = excluded.total_cost,
      current_streak = excluded.current_streak,
      best_streak = excluded.best_streak,
      head_to_head = excluded.head_to_head`
  );

  const tx = db.transaction(() => {
    for (const stat of stats) {
      const existing = selectProfile.get(stat.provider);

      const previousMatches = existing?.matches ?? 0;
      const counts = computeOutcomeCounts(stat);
      const wins = (existing?.wins ?? 0) + counts.win;
      const losses = (existing?.losses ?? 0) + counts.loss;
      const dnfs = (existing?.dnfs ?? 0) + counts.dnf;
      const matches = previousMatches + 1;

      const currentStreak = stat.outcome === "winner" ? (existing?.current_streak ?? 0) + 1 : 0;
      const bestStreak = Math.max(existing?.best_streak ?? 0, currentStreak);

      const headToHead = updateHeadToHeadMap(
        parseHeadToHead(existing?.head_to_head ?? null),
        stat.provider,
        stat.outcome,
        stats
      );

      upsertProfile.run({
        provider: stat.provider,
        model: stat.model ?? existing?.model ?? null,
        matches,
        wins,
        losses,
        dnfs,
        win_rate: matches > 0 ? wins / matches : 0,
        avg_time: updateRunningAverage(existing?.avg_time ?? 0, previousMatches, stat.timeToCompletion),
        avg_files: updateRunningAverage(existing?.avg_files ?? 0, previousMatches, stat.filesChanged),
        avg_insertions: updateRunningAverage(existing?.avg_insertions ?? 0, previousMatches, stat.insertions),
        avg_tokens: updateRunningAverage(existing?.avg_tokens ?? 0, previousMatches, stat.tokensUsed),
        avg_cost: updateRunningAverage(existing?.avg_cost ?? 0, previousMatches, stat.costUSD),
        total_tokens: (existing?.total_tokens ?? 0) + stat.tokensUsed,
        total_cost: (existing?.total_cost ?? 0) + stat.costUSD,
        current_streak: currentStreak,
        best_streak: bestStreak,
        head_to_head: JSON.stringify(headToHead)
      });
    }
  });

  tx();
}

export function getRecentMatches(db: Database.Database, limit = 20): MatchListItem[] {
  const stmt = db.prepare(
    `SELECT id, prompt, status, started_at as startedAt, ended_at as endedAt, winner_id as winnerId
     FROM matches
     ORDER BY started_at DESC
     LIMIT ?`
  );

  return stmt.all(limit) as MatchListItem[];
}

export function getLeaderboard(db: Database.Database): LeaderboardRow[] {
  const rows = db
    .prepare(
      `SELECT
        provider,
        matches,
        wins,
        losses,
        dnfs,
        win_rate as winRate,
        avg_time as avgTimeToCompletion,
        avg_files as avgFilesChanged,
        avg_insertions as avgInsertions,
        avg_tokens as avgTokensUsed,
        avg_cost as avgCostPerMatch,
        total_tokens as totalTokens,
        total_cost as totalCostUSD
      FROM agent_profiles
      ORDER BY win_rate DESC, matches DESC`
    )
    .all() as LeaderboardRow[];

  return rows;
}

export function getAgentProfile(db: Database.Database, provider: string): AgentProfile | null {
  const row = db.prepare("SELECT * FROM agent_profiles WHERE provider = ?").get(provider) as
    | StoredProfileRow
    | undefined;

  if (!row) {
    return null;
  }

  return toAgentProfile(row);
}

export function getHeadToHead(
  db: Database.Database,
  providerA: string,
  providerB: string
): { aWins: number; bWins: number } {
  const profileA = getAgentProfile(db, providerA);
  const profileB = getAgentProfile(db, providerB);

  return {
    aWins: profileA?.headToHead[providerB]?.wins ?? 0,
    bWins: profileB?.headToHead[providerA]?.wins ?? 0
  };
}
