import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/store/sqlite.js";
import { getAgentProfile, getHeadToHead, getLeaderboard, getRecentMatches, persistMatch } from "../src/store/queries.js";
import type { Match } from "../src/match/types.js";
import { createTempDir } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createMockMatch(repoPath: string): Match {
  const startedAt = new Date("2026-03-05T10:00:00.000Z");
  const endedAt = new Date("2026-03-05T10:02:00.000Z");

  return {
    id: "match_20260305_1000",
    prompt: "build feature",
    effectivePrompt: "build feature",
    promptStrategy: "plain",
    repo: repoPath,
    baseBranch: "main",
    status: "reviewing",
    startedAt,
    endedAt,
    winnerId: "alpha-1",
    stats: {
      matchId: "match_20260305_1000",
      prompt: "build feature",
      duration: 120,
      agentStats: [
        {
          agentId: "alpha-1",
          provider: "alpha",
          branch: "gg/match_20260305_1000/alpha/task",
          outcome: "winner",
          timeToFirstOutput: 2,
          timeToCompletion: 80,
          timeRemaining: 40,
          filesChanged: 3,
          filesAdded: 2,
          filesDeleted: 0,
          insertions: 100,
          deletions: 10,
          netLines: 90,
          commits: 2,
          tokensUsed: 1000,
          costUSD: 0.2,
          costPerFile: 0.067,
          tokensPerLine: 11,
          totalOutputChars: 200,
          riskFlags: [],
          checksResults: [{ name: "npm test", passed: true }]
        },
        {
          agentId: "beta-1",
          provider: "beta",
          branch: "gg/match_20260305_1000/beta/task",
          outcome: "loser",
          timeToFirstOutput: 4,
          timeToCompletion: 100,
          timeRemaining: 20,
          filesChanged: 1,
          filesAdded: 1,
          filesDeleted: 0,
          insertions: 20,
          deletions: 2,
          netLines: 18,
          commits: 1,
          tokensUsed: 600,
          costUSD: 0.1,
          costPerFile: 0.1,
          tokensPerLine: 33,
          totalOutputChars: 90,
          riskFlags: ["guard"],
          checksResults: [{ name: "npm test", passed: false }]
        }
      ]
    },
    checks: {
      "alpha-1": [{ name: "npm test", passed: true }],
      "beta-1": [{ name: "npm test", passed: false }]
    },
    privacy: "private",
    logDir: path.join(repoPath, "logs"),
    agents: [
      {
        id: "alpha-1",
        provider: "alpha",
        branch: "gg/match_20260305_1000/alpha/task",
        worktreePath: path.join(repoPath, "wt-alpha"),
        status: "completed",
        tokensUsed: 1000,
        costUSD: 0.2,
        logPath: path.join(repoPath, "logs", "alpha.log"),
        threadPath: path.join(repoPath, "logs", "alpha.thread.json"),
        riskFlags: []
      },
      {
        id: "beta-1",
        provider: "beta",
        branch: "gg/match_20260305_1000/beta/task",
        worktreePath: path.join(repoPath, "wt-beta"),
        status: "completed",
        tokensUsed: 600,
        costUSD: 0.1,
        logPath: path.join(repoPath, "logs", "beta.log"),
        threadPath: path.join(repoPath, "logs", "beta.thread.json"),
        riskFlags: ["guard"]
      }
    ]
  };
}

describe("store queries", () => {
  it("persists matches and updates profiles/leaderboard", () => {
    const root = createTempDir("gg-store-");
    tempDirs.push(root);

    const dbPath = path.join(root, "gg.db");
    const db = openDatabase(dbPath);

    try {
      const match = createMockMatch(root);
      persistMatch(db, match);

      const history = getRecentMatches(db, 10);
      expect(history).toHaveLength(1);
      expect(history[0]!.id).toBe(match.id);

      const leaderboard = getLeaderboard(db);
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0]!.provider).toBe("alpha");

      const profile = getAgentProfile(db, "alpha");
      expect(profile?.wins).toBe(1);
      expect(profile?.matches).toBe(1);

      const h2h = getHeadToHead(db, "alpha", "beta");
      expect(h2h.aWins).toBe(1);
      expect(h2h.bWins).toBe(0);
    } finally {
      db.close();
    }
  });
});
