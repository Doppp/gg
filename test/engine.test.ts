import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentExecutor } from "../src/agents/types.js";
import { MatchEngine } from "../src/match/engine.js";
import { createTempDir, initGitRepo } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createCommitExecutor(provider: string): AgentExecutor {
  return {
    provider,
    async spawn(entry, _options, handlers) {
      let killed = false;
      const pid = Math.floor(Math.random() * 10_000) + 1000;

      handlers.onStart?.(pid);

      void (async () => {
        await delay(40);
        if (killed) {
          return;
        }

        const filePath = path.join(entry.worktreePath, `${provider}.txt`);
        fs.writeFileSync(filePath, `${provider}\n`, "utf8");
        execSync(`git add ${provider}.txt`, { cwd: entry.worktreePath, stdio: "pipe" });
        execSync(`git commit -m \"${provider} update\"`, { cwd: entry.worktreePath, stdio: "pipe" });

        handlers.onStdout?.(`[${provider}] wrote ${provider}.txt\n`);
        handlers.onExit?.(0, null);
      })();

      return {
        pid,
        kill: () => {
          killed = true;
          handlers.onExit?.(130, "SIGINT");
        }
      };
    }
  };
}

function createHangingExecutor(provider: string): AgentExecutor {
  return {
    provider,
    async spawn(_entry, _options, handlers) {
      const pid = Math.floor(Math.random() * 10_000) + 1000;
      handlers.onStart?.(pid);
      handlers.onStdout?.(`[${provider}] started\n`);

      return {
        pid,
        kill: () => {
          handlers.onExit?.(130, "SIGINT");
        }
      };
    }
  };
}

describe("match engine", () => {
  it("runs agents, writes artifacts, computes stats, and merges winner", async () => {
    const repoPath = createTempDir("gg-engine-run-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);

    const engine = new MatchEngine({
      repoPath,
      executors: {
        alpha: createCommitExecutor("alpha"),
        beta: createCommitExecutor("beta")
      },
      repoConfig: {
        checks: ["node -e \"process.exit(0)\""]
      }
    });

    const started = await engine.startMatch({
      prompt: "create files",
      providers: ["alpha", "beta"],
      timeLimitSeconds: 30,
      privacy: "private"
    });

    const finished = await engine.waitForMatch(started.id);

    expect(finished.status).toBe("reviewing");
    expect(finished.stats.agentStats).toHaveLength(2);
    expect(finished.stats.agentStats.every((stat) => stat.filesChanged >= 1)).toBe(true);
    expect(finished.stats.agentStats.every((stat) => stat.commits >= 1)).toBe(true);

    for (const agent of finished.agents) {
      expect(fs.existsSync(agent.logPath)).toBe(true);
      expect(fs.existsSync(agent.threadPath)).toBe(true);
    }

    const merged = await engine.mergeWinner(finished.id, finished.agents[0]!.id);

    expect(merged.status).toBe("merged");
    expect(merged.winnerId).toBe(finished.agents[0]!.id);

    const mergedFile = path.join(repoPath, `${finished.agents[0]!.provider}.txt`);
    expect(fs.existsSync(mergedFile)).toBe(true);
  });

  it("times out slow agents and marks timeout status", async () => {
    const repoPath = createTempDir("gg-engine-timeout-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);

    const engine = new MatchEngine({
      repoPath,
      executors: {
        slowA: createHangingExecutor("slowA"),
        slowB: createHangingExecutor("slowB")
      }
    });

    const started = await engine.startMatch({
      prompt: "never finish",
      providers: ["slowA", "slowB"],
      timeLimitSeconds: 1,
      privacy: "private"
    });

    const finished = await engine.waitForMatch(started.id);

    expect(finished.status).toBe("reviewing");
    expect(finished.agents.every((agent) => agent.status === "timeout")).toBe(true);
  });
});
