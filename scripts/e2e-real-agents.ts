import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import minimist from "minimist";
import { detectInstalledAgents } from "../src/agents/detector.js";
import type { RepoConfig } from "../src/config/config.js";
import { DEFAULT_CONFIG, type AgentConfig } from "../src/config/defaults.js";
import { formatCurrency, formatDuration } from "../src/lib/format.js";
import { MatchEngine } from "../src/match/engine.js";
import type { AgentEntry, AgentMatchStats, PromptStrategy } from "../src/match/types.js";

type ScenarioName = "multiply" | "title-case" | "clamp";

interface Scenario {
  name: ScenarioName;
  description: string;
  prompt: string;
}

interface DemoFixture {
  rootDir: string;
  repoPath: string;
  artifactsDir: string;
}

const SCENARIOS: Record<ScenarioName, Scenario> = {
  multiply: {
    name: "multiply",
    description: "Add a new multiply helper and tests.",
    prompt:
      "Add and export a multiply(a, b) function in src/index.js. Add focused tests in test/index.test.js. Keep changes minimal and do not modify package.json."
  },
  "title-case": {
    name: "title-case",
    description: "Add a titleCase helper and tests.",
    prompt:
      "Add and export a titleCase(input) function in src/index.js. Add focused tests in test/index.test.js. Collapse repeated whitespace in the result. Keep changes minimal and do not modify package.json."
  },
  clamp: {
    name: "clamp",
    description: "Add a clamp helper and tests.",
    prompt:
      "Add and export a clamp(value, min, max) function in src/index.js. Add focused tests in test/index.test.js. Keep changes minimal and do not modify package.json."
  }
};

const LIVE_AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    enabled: true,
    command: "claude",
    args: ["--dangerously-skip-permissions"]
  },
  codex: {
    enabled: true,
    command: "codex",
    args: []
  }
};

function usage(): void {
  process.stdout.write(`Real-agent E2E demo\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  npm run demo:e2e:real -- --live [--scenario multiply|title-case|clamp] [--time-limit 180] [--strategy plain|competition] [--keep]\n`);
  process.stdout.write(`  npm run demo:e2e:real -- --live --prompt "custom prompt" [--time-limit 180] [--keep]\n\n`);
  process.stdout.write(`Notes:\n`);
  process.stdout.write(`  --live is required because this uses your real Claude/Codex CLIs and may incur cost.\n`);
  process.stdout.write(`  --keep leaves the disposable repo and artifacts on disk for inspection.\n`);
}

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function runGit(repoPath: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoPath, stdio: "pipe" }).toString("utf8").trim();
}

function initRepo(repoPath: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd: repoPath, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "demo@example.com"], { cwd: repoPath, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "gg demo"], { cwd: repoPath, stdio: "pipe" });
}

function createFixture(): DemoFixture {
  const rootDir = createTempDir("gg-real-demo-");
  const repoPath = path.join(rootDir, "repo");
  const artifactsDir = path.join(rootDir, "artifacts");

  fs.mkdirSync(repoPath, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });

  initRepo(repoPath);

  writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify(
      {
        name: "gg-real-demo-app",
        version: "0.0.1",
        type: "module",
        scripts: {
          test: "node --test",
          build: "node --check src/index.js"
        }
      },
      null,
      2
    ) + "\n"
  );

  writeFile(
    path.join(repoPath, "src", "index.js"),
    `export function sum(a, b) {
  return a + b;
}

export function greet(name) {
  return \`Hello, \${name}!\`;
}
`
  );

  writeFile(
    path.join(repoPath, "test", "index.test.js"),
    `import test from "node:test";
import assert from "node:assert/strict";
import { greet, sum } from "../src/index.js";

test("sum adds two numbers", () => {
  assert.equal(sum(2, 3), 5);
});

test("greet formats a name", () => {
  assert.equal(greet("gg"), "Hello, gg!");
});
`
  );

  const repoConfig: RepoConfig = {
    checks: ["npm test", "npm run build"],
    review: {
      test: "npm test",
      build: "npm run build",
      run: 'node -e "import(\\"./src/index.js\\").then((m) => console.log(Object.keys(m).join(\\" \\")))"'
    }
  };

  writeFile(path.join(repoPath, "gg.config.json"), JSON.stringify(repoConfig, null, 2) + "\n");
  writeFile(
    path.join(repoPath, "README.md"),
    `# gg real-agent demo repo

This disposable repo exists only for the live gg demo script.
`
  );

  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "seed disposable demo repo"], { cwd: repoPath, stdio: "pipe" });

  return { rootDir, repoPath, artifactsDir };
}

function removeFixture(fixture: DemoFixture): void {
  if (fs.existsSync(fixture.rootDir)) {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
}

function resolveScenario(value: unknown): Scenario {
  if (typeof value !== "string" || value.trim().length === 0) {
    return SCENARIOS.multiply;
  }

  const scenario = SCENARIOS[value.trim().toLowerCase() as ScenarioName];
  if (!scenario) {
    const choices = Object.keys(SCENARIOS).join(", ");
    throw new Error(`Unknown scenario '${value}'. Available scenarios: ${choices}`);
  }

  return scenario;
}

function parseTimeLimit(value: unknown): number {
  if (value === undefined) {
    return 180;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Time limit must be a positive number of seconds.");
  }
  return parsed;
}

function parseStrategy(value: unknown): PromptStrategy {
  if (value === undefined) {
    return "competition";
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "plain" || normalized === "competition") {
    return normalized;
  }

  throw new Error("Strategy must be 'plain' or 'competition'.");
}

function formatNow(date = new Date()): string {
  return date.toISOString().slice(11, 19);
}

function printLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function printSection(title: string): void {
  printLine("");
  printLine(title);
}

function createOutputPrinter(): {
  onChunk: (provider: string, stream: "stdout" | "stderr", chunk: string) => void;
  flush: () => void;
} {
  const buffers = new Map<string, string>();

  function emit(provider: string, stream: "stdout" | "stderr", line: string): void {
    if (line.trim().length === 0) {
      return;
    }
    printLine(`[${formatNow()}] ${provider} ${stream}> ${line}`);
  }

  return {
    onChunk(provider, stream, chunk) {
      const key = `${provider}:${stream}`;
      const pending = (buffers.get(key) ?? "") + chunk.replace(/\r/g, "\n");
      const parts = pending.split("\n");
      const nextPending = parts.pop() ?? "";
      buffers.set(key, nextPending);
      for (const line of parts) {
        emit(provider, stream, line);
      }
    },
    flush() {
      for (const [key, pending] of buffers.entries()) {
        if (pending.trim().length === 0) {
          continue;
        }
        const [provider, stream] = key.split(":") as [string, "stdout" | "stderr"];
        emit(provider, stream, pending);
      }
      buffers.clear();
    }
  };
}

function printAgentSummary(agent: AgentEntry, stats: AgentMatchStats | undefined): void {
  const checks = stats?.checksResults ?? [];
  const passedChecks = checks.filter((check) => check.passed).length;
  const totalChecks = checks.length;

  printLine(
    `- ${agent.provider}: ${agent.status} | time ${formatDuration(stats?.timeToCompletion ?? 0)} | first output ${formatDuration(
      stats?.timeToFirstOutput ?? 0
    )} | files ${stats?.filesChanged ?? 0} | +${stats?.insertions ?? 0}/-${stats?.deletions ?? 0} | commits ${stats?.commits ?? 0} | checks ${passedChecks}/${totalChecks} | cost ${formatCurrency(stats?.costUSD ?? 0)}`
  );
  printLine(`  branch: ${agent.branch}`);
  printLine(`  worktree: ${agent.worktreePath}`);
  printLine(`  log: ${agent.logPath}`);
  printLine(`  thread: ${agent.threadPath}`);
  if ((agent.riskFlags ?? []).length > 0) {
    printLine(`  risk: ${agent.riskFlags.join("; ")}`);
  }
}

async function main(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    string: ["scenario", "prompt", "strategy", "time-limit"],
    boolean: ["help", "live", "keep"],
    alias: {
      h: "help"
    }
  });

  if (argv.help) {
    usage();
    return;
  }

  if (!argv.live) {
    throw new Error("Refusing to run live agents without --live. This command may incur real Claude/Codex usage.");
  }

  const scenario = resolveScenario(argv.scenario);
  const prompt = typeof argv.prompt === "string" && argv.prompt.trim().length > 0 ? argv.prompt.trim() : scenario.prompt;
  const strategy = parseStrategy(argv.strategy);
  const timeLimitSeconds = parseTimeLimit(argv["time-limit"]);
  const keep = argv.keep === true || process.env.GG_KEEP_E2E_TMP === "1";

  const detectionConfig = {
    ...DEFAULT_CONFIG,
    agents: LIVE_AGENT_CONFIGS
  };

  const detected = await detectInstalledAgents(detectionConfig);
  const missing = ["claude", "codex"].filter((provider) => !detected.some((agent) => agent.provider === provider));
  if (missing.length > 0) {
    throw new Error(`Missing required live agents: ${missing.join(", ")}. Check PATH/auth before running this demo.`);
  }

  const fixture = createFixture();
  const printer = createOutputPrinter();

  try {
    printSection("Live agent E2E demo");
    printLine(`scenario: ${scenario.name} - ${scenario.description}`);
    printLine(`prompt: ${prompt}`);
    printLine(`strategy: ${strategy}`);
    printLine(`time limit: ${timeLimitSeconds}s`);
    printLine(`repo: ${fixture.repoPath}`);
    printLine(`artifacts: ${fixture.artifactsDir}`);
    printLine(`detected agents: ${detected.map((agent) => `${agent.provider} (${agent.version})`).join(", ")}`);

    const repoConfig = JSON.parse(fs.readFileSync(path.join(fixture.repoPath, "gg.config.json"), "utf8")) as RepoConfig;
    const engine = new MatchEngine({
      repoPath: fixture.repoPath,
      worktreeDir: ".gg-worktrees",
      matchesDir: fixture.artifactsDir,
      agentConfigs: LIVE_AGENT_CONFIGS,
      repoConfig,
      allowSecrets: false
    });

    const statusByAgent = new Map<string, string>();
    const match = await engine.startMatch(
      {
        prompt,
        providers: ["claude", "codex"],
        promptStrategy: strategy,
        baseBranchMode: "new",
        baseBranchTheme: scenario.name,
        timeLimitSeconds,
        privacy: "private"
      },
      {
        onMatchUpdated(updatedMatch) {
          if (updatedMatch.status === "running") {
            printLine(`[${formatNow()}] match ${updatedMatch.id} running on ${updatedMatch.baseBranch}`);
          }
        },
        onAgentUpdated(agent) {
          const previous = statusByAgent.get(agent.id);
          if (previous !== agent.status) {
            statusByAgent.set(agent.id, agent.status);
            printLine(`[${formatNow()}] ${agent.provider} status -> ${agent.status}`);
          }
        },
        onAgentOutput(event) {
          printer.onChunk(event.provider, event.stream, event.chunk);
        },
        onRiskFlag(agent, reason) {
          printLine(`[${formatNow()}] ${agent.provider} risk flag -> ${reason}`);
        }
      }
    );

    printSection("Match started");
    printLine(`match id: ${match.id}`);
    printLine(`base branch: ${match.baseBranch} (from ${match.sourceBranch ?? "unknown"})`);
    for (const agent of match.agents) {
      printLine(`- ${agent.provider}: ${agent.worktreePath}`);
    }

    const finished = await engine.waitForMatch(match.id);
    printer.flush();

    printSection("Match complete");
    printLine(`status: ${finished.status}`);
    printLine(`duration: ${formatDuration(finished.stats.duration)}`);
    for (const agent of finished.agents) {
      const stats = finished.stats.agentStats.find((entry) => entry.agentId === agent.id);
      printAgentSummary(agent, stats);
    }

    printSection("Git state");
    printLine(`repo branch after run: ${runGit(fixture.repoPath, ["branch", "--show-current"])}`);
    printLine(`branches:`);
    for (const branch of runGit(fixture.repoPath, ["branch", "--format=%(refname:short)"]).split("\n")) {
      printLine(`- ${branch}`);
    }

    printSection("Next steps");
    printLine(`Inspect worktrees under ${path.join(fixture.repoPath, ".gg-worktrees")}`);
    printLine(`Inspect artifacts under ${fixture.artifactsDir}`);
    printLine(`Use --keep or GG_KEEP_E2E_TMP=1 to preserve the temp repo for manual inspection.`);
  } finally {
    if (!keep) {
      removeFixture(fixture);
    } else {
      printSection("Temporary files kept");
      printLine(fixture.rootDir);
    }
  }
}

void main().catch((error: Error) => {
  process.stderr.write(`Live agent E2E demo failed: ${error.message}\n`);
  process.exitCode = 1;
});
