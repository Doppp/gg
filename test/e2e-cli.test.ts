import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitOutput } from "./helpers/git.js";
import {
  artifactsDirForMatch,
  createE2EFixture,
  parseJsonOutput,
  parseStartedMatchId,
  removeE2EFixture,
  runGgCommand,
  type E2EFixture
} from "./helpers/e2e.js";

const fixtures: E2EFixture[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const fixture = fixtures.pop();
    if (fixture) {
      removeE2EFixture(fixture);
    }
  }
});

describe("cli e2e", () => {
  it("runs a headless match with fake agents, persists metadata, and exposes artifacts", async () => {
    const fixture = createE2EFixture();
    fixtures.push(fixture);

    const runResult = await runGgCommand(fixture, [
      "run",
      "add search UI",
      "--agents",
      "claude codex",
      "--repo",
      fixture.repoPath,
      "--base",
      "new",
      "--theme",
      "search-ui",
      "--strategy",
      "competition",
      "--time-limit",
      "0"
    ]);

    expect(runResult.exitCode).toBe(0);

    const matchId = parseStartedMatchId(runResult.stdout);
    const summary = parseJsonOutput<{
      matchId: string;
      status: string;
      duration: number;
      agents: Array<{ provider: string }>;
    }>(runResult.stdout);

    expect(summary.matchId).toBe(matchId);
    expect(summary.status).toBe("reviewing");
    expect(summary.agents.map((agent) => agent.provider).sort()).toEqual(["claude", "codex"]);

    expect(gitOutput(fixture.repoPath, "git branch --show-current")).toBe("main");
    expect(gitOutput(fixture.repoPath, "git branch --list")).toContain("feat/search-ui");

    const historyResult = await runGgCommand(fixture, ["history", "--repo", fixture.repoPath]);
    expect(historyResult.exitCode).toBe(0);
    const history = parseJsonOutput<
      Array<{ id: string; sourceBranch: string | null; baseBranch: string; baseBranchMode: string | null }>
    >(historyResult.stdout);
    expect(history[0]?.id).toBe(matchId);
    expect(history[0]?.sourceBranch).toBe("main");
    expect(history[0]?.baseBranch).toBe("feat/search-ui");
    expect(history[0]?.baseBranchMode).toBe("new");

    const threadResult = await runGgCommand(fixture, ["thread", matchId, "claude-1", "--repo", fixture.repoPath]);
    expect(threadResult.exitCode).toBe(0);
    const thread = parseJsonOutput<{
      prompt: string;
      promptStrategy: string;
      effectivePrompt: string;
      events: Array<{ type: string }>;
    }>(threadResult.stdout);
    expect(thread.prompt).toBe("add search UI");
    expect(thread.promptStrategy).toBe("competition");
    expect(thread.effectivePrompt).toContain("blind head-to-head coding match");
    expect(thread.events.some((event) => event.type === "effective_prompt")).toBe(true);

    const artifactsDir = artifactsDirForMatch(fixture, matchId);
    expect(fs.existsSync(path.join(artifactsDir, "match.json"))).toBe(true);
    expect(fs.existsSync(path.join(artifactsDir, "claude.log"))).toBe(true);
    expect(fs.existsSync(path.join(artifactsDir, "codex.thread.json"))).toBe(true);

    const claudeLog = fs.readFileSync(path.join(artifactsDir, "claude.log"), "utf8");
    expect(claudeLog).toContain("blind head-to-head coding match");

    const checksDir = path.join(artifactsDir, "checks", "claude");
    expect(fs.existsSync(checksDir)).toBe(true);
    expect(fs.readdirSync(checksDir).length).toBeGreaterThan(0);
  });
});
