import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentExecutor } from "../src/agents/types.js";
import { MatchEngine } from "../src/match/engine.js";
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

function createCommitExecutor(provider: string, seenPrompts?: string[]): AgentExecutor {
  return {
    provider,
    async spawn(entry, options, handlers) {
      let killed = false;
      const pid = Math.floor(Math.random() * 10_000) + 1000;

      seenPrompts?.push(options.prompt);

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
    const promptsSeen: string[] = [];
    const matchesDir = path.join(repoPath, ".match-artifacts");

    const engine = new MatchEngine({
      repoPath,
      matchesDir,
      executors: {
        alpha: createCommitExecutor("alpha", promptsSeen),
        beta: createCommitExecutor("beta", promptsSeen)
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
    expect(finished.promptStrategy).toBe("plain");
    expect(finished.effectivePrompt).toBe("create files");
    expect(finished.stats.agentStats).toHaveLength(2);
    expect(finished.stats.agentStats.every((stat) => stat.filesChanged >= 1)).toBe(true);
    expect(finished.stats.agentStats.every((stat) => stat.commits >= 1)).toBe(true);
    expect(promptsSeen).toEqual(["create files", "create files"]);

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

  it("prepends the competition prompt without replacing the visible user prompt", async () => {
    const repoPath = createTempDir("gg-engine-competition-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);
    const promptsSeen: string[] = [];
    const matchesDir = path.join(repoPath, ".match-artifacts");

    const engine = new MatchEngine({
      repoPath,
      matchesDir,
      executors: {
        alpha: createCommitExecutor("alpha", promptsSeen),
        beta: createCommitExecutor("beta", promptsSeen)
      }
    });

    const started = await engine.startMatch({
      prompt: "implement search",
      promptStrategy: "competition",
      providers: ["alpha", "beta"],
      timeLimitSeconds: 30,
      privacy: "private"
    });

    const finished = await engine.waitForMatch(started.id);

    expect(finished.prompt).toBe("implement search");
    expect(finished.promptStrategy).toBe("competition");
    expect(finished.effectivePrompt).toContain("blind head-to-head coding match");
    expect(promptsSeen.every((prompt) => prompt.includes("Task:\nimplement search"))).toBe(true);

    const threadRaw = fs.readFileSync(finished.agents[0]!.threadPath, "utf8");
    expect(threadRaw).toContain("\"type\": \"effective_prompt\"");
    expect(threadRaw).toContain("\"strategy\": \"competition\"");
  });

  it("can create a named base branch from the current branch without switching the repo during the race", async () => {
    const repoPath = createTempDir("gg-engine-base-branch-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);
    const matchesDir = path.join(repoPath, ".match-artifacts");

    const engine = new MatchEngine({
      repoPath,
      matchesDir,
      executors: {
        alpha: createCommitExecutor("alpha"),
        beta: createCommitExecutor("beta")
      }
    });

    const started = await engine.startMatch({
      prompt: "implement search",
      providers: ["alpha", "beta"],
      baseBranchMode: "new",
      baseBranchTheme: "search ui",
      timeLimitSeconds: 30,
      privacy: "private"
    });

    expect(started.sourceBranch).toBe("main");
    expect(started.baseBranchMode).toBe("new");
    expect(started.baseBranch).toBe("feat/search-ui");
    expect(gitOutput(repoPath, "git branch --show-current")).toBe("main");

    const finished = await engine.waitForMatch(started.id);
    expect(gitOutput(repoPath, "git branch --show-current")).toBe("main");

    const merged = await engine.mergeWinner(finished.id, finished.agents[0]!.id);
    expect(merged.baseBranch).toBe("feat/search-ui");
    expect(gitOutput(repoPath, "git branch --show-current")).toBe("feat/search-ui");
  });

  it("times out slow agents and marks timeout status", async () => {
    const repoPath = createTempDir("gg-engine-timeout-");
    tempDirs.push(repoPath);
    initGitRepo(repoPath);
    const matchesDir = path.join(repoPath, ".match-artifacts");

    const engine = new MatchEngine({
      repoPath,
      matchesDir,
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
