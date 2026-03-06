import fs from "node:fs";
import path from "node:path";
import { gitOutput } from "../test/helpers/git.js";
import {
  artifactsDirForMatch,
  createE2EFixture,
  parseJsonOutput,
  parseStartedMatchId,
  removeE2EFixture,
  runGgCommand
} from "../test/helpers/e2e.js";

async function main(): Promise<void> {
  const fixture = createE2EFixture("gg-e2e-demo-");
  const keepFixture = process.env.GG_KEEP_E2E_TMP === "1";

  try {
    console.log("E2E smoke run");
    console.log(`temp repo: ${fixture.repoPath}`);
    console.log(`temp home: ${fixture.homeDir}`);
    console.log("");

    console.log("1. Running headless match with fake claude/codex agents...");
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

    process.stdout.write(runResult.stdout);
    if (runResult.stderr.trim().length > 0) {
      process.stderr.write(runResult.stderr);
    }
    if (runResult.exitCode !== 0) {
      throw new Error(`headless run failed with exit code ${runResult.exitCode}`);
    }

    const matchId = parseStartedMatchId(runResult.stdout);
    const summary = parseJsonOutput<{ status: string; agents: Array<{ provider: string }> }>(runResult.stdout);

    console.log("");
    console.log("2. Querying match history...");
    const historyResult = await runGgCommand(fixture, ["history", "--repo", fixture.repoPath]);
    process.stdout.write(historyResult.stdout);
    if (historyResult.exitCode !== 0) {
      throw new Error(`history command failed with exit code ${historyResult.exitCode}`);
    }

    console.log("");
    console.log("3. Reading the recorded thread for claude-1...");
    const threadResult = await runGgCommand(fixture, ["thread", matchId, "claude-1", "--repo", fixture.repoPath]);
    const thread = parseJsonOutput<{ events: Array<{ type: string }>; effectivePrompt: string }>(threadResult.stdout);
    console.log(`thread event count: ${thread.events.length}`);
    console.log(`effective prompt preview: ${thread.effectivePrompt.slice(0, 120)}...`);

    console.log("");
    console.log("4. Inspecting repo state...");
    console.log(`current branch: ${gitOutput(fixture.repoPath, "git branch --show-current")}`);
    console.log(`local branches:\n${gitOutput(fixture.repoPath, "git branch --list")}`);

    const artifactsDir = artifactsDirForMatch(fixture, matchId);
    const claudeLog = fs.readFileSync(path.join(artifactsDir, "claude.log"), "utf8");
    console.log("");
    console.log("5. Inspecting artifacts...");
    console.log(`artifacts dir: ${artifactsDir}`);
    console.log(`summary status: ${summary.status}`);
    console.log(`agents: ${summary.agents.map((agent) => agent.provider).join(", ")}`);
    console.log(`claude log preview: ${claudeLog.split(/\r?\n/).slice(0, 3).join(" | ")}`);

    console.log("");
    console.log("E2E smoke run completed successfully.");
    if (keepFixture) {
      console.log(`temporary files kept at: ${fixture.rootDir}`);
    }
  } finally {
    if (!keepFixture) {
      removeE2EFixture(fixture);
    }
  }
}

void main().catch((error: Error) => {
  process.stderr.write(`E2E smoke run failed: ${error.message}\n`);
  process.exitCode = 1;
});
