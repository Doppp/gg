#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import minimist from "minimist";
import { loadConfig, loadRepoConfig } from "./config/config.js";
import { isGitRepository } from "./lib/git.js";
import { MatchEngine } from "./match/engine.js";
import { readThreadFromFile } from "./match/thread.js";
import type { BaseBranchMode, PromptStrategy } from "./match/types.js";
import { cleanRecoveryState, scanRecoveryState } from "./recovery/recovery.js";
import {
  getAgentProfile,
  getHeadToHead,
  getLeaderboard,
  getRecentMatches,
  persistMatch
} from "./store/queries.js";
import { defaultDatabasePath, openDatabase } from "./store/sqlite.js";
import { launchTui } from "./tui/cli.js";

function printHelp(): void {
  process.stdout.write(`gg - Good game. Every time.\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  gg [--repo /path/to/repo]\n`);
  process.stdout.write(`  gg run \"<prompt>\" --agents claude codex [--base current|new] [--theme short-name] [--strategy plain|competition]\n`);
  process.stdout.write(`  gg stats\n`);
  process.stdout.write(`  gg leaderboard\n`);
  process.stdout.write(`  gg history\n`);
  process.stdout.write(`  gg profile <provider>\n`);
  process.stdout.write(`  gg h2h <providerA> <providerB>\n`);
  process.stdout.write(`  gg thread <matchId> <agentId>\n`);
  process.stdout.write(`  gg clean\n`);
  process.stdout.write(`  gg config allowSecrets true\n`);
  process.stdout.write(`  gg config leaderboard true\n`);
}

interface HeadlessRunOverrides {
  timeLimitSeconds?: number;
  privacy?: "public" | "private" | "anonymous";
  promptStrategy?: PromptStrategy;
  baseBranchMode?: BaseBranchMode;
  baseBranchTheme?: string;
}

function resolveRepoPath(argv: minimist.ParsedArgs): string {
  return path.resolve(typeof argv.repo === "string" ? argv.repo : process.cwd());
}

function parseAgentsArg(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function updateLocalConfig(repoPath: string, key: string, value: string): void {
  const configPath = path.join(repoPath, "gg.toml");
  const boolValue = value.toLowerCase() === "true";

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, "", "utf8");
  }

  const raw = fs.readFileSync(configPath, "utf8");

  let next = raw;
  if (key === "allowSecrets") {
    if (/\[safety\][\s\S]*?allow_secrets\s*=\s*(true|false)/m.test(next)) {
      next = next.replace(/(allow_secrets\s*=\s*)(true|false)/m, `$1${boolValue}`);
    } else {
      next += `\n[safety]\nallow_secrets = ${boolValue}\n`;
    }
  } else if (key === "leaderboard") {
    if (/\[leaderboard\][\s\S]*?enabled\s*=\s*(true|false)/m.test(next)) {
      next = next.replace(/(enabled\s*=\s*)(true|false)/m, `$1${boolValue}`);
    } else {
      next += `\n[leaderboard]\nenabled = ${boolValue}\n`;
    }
  } else {
    throw new Error(`Unsupported config key '${key}'.`);
  }

  fs.writeFileSync(configPath, next, "utf8");
}

async function runHeadless(
  repoPath: string,
  prompt: string,
  providers: string[],
  overrides: HeadlessRunOverrides = {}
): Promise<void> {
  const config = loadConfig(repoPath);
  const repoConfig = loadRepoConfig(repoPath);
  const db = openDatabase();

  try {
    const engine = new MatchEngine({
      repoPath,
      worktreeDir: config.gg.worktree_dir,
      agentConfigs: config.agents,
      repoConfig,
      allowSecrets: config.safety.allow_secrets
    });

    const match = await engine.startMatch({
      prompt,
      promptStrategy: overrides.promptStrategy ?? config.gg.default_prompt_strategy,
      baseBranchMode: overrides.baseBranchMode,
      baseBranchTheme: overrides.baseBranchTheme,
      providers,
      timeLimitSeconds: overrides.timeLimitSeconds ?? config.gg.default_time_limit,
      privacy: overrides.privacy ?? config.leaderboard.default_privacy
    });

    process.stdout.write(`Started match ${match.id}\n`);

    const finished = await engine.waitForMatch(match.id);
    persistMatch(db, finished);

    printJson({
      matchId: finished.id,
      status: finished.status,
      duration: finished.stats.duration,
      agents: finished.stats.agentStats
    });
  } finally {
    db.close();
  }
}

function parsePromptStrategy(value: unknown): PromptStrategy | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "plain" || normalized === "competition") {
    return normalized;
  }

  throw new Error("Prompt strategy must be 'plain' or 'competition'.");
}

function parseBaseBranchMode(value: unknown): BaseBranchMode | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "current" || normalized === "new") {
    return normalized;
  }

  throw new Error("Base branch mode must be 'current' or 'new'.");
}

function parsePrivacy(value: unknown): "public" | "private" | "anonymous" | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "public" || normalized === "private" || normalized === "anonymous") {
    return normalized;
  }

  throw new Error("Privacy must be 'public', 'private', or 'anonymous'.");
}

function parseTimeLimit(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Time limit must be a non-negative number of seconds.");
  }

  return parsed;
}

async function run(): Promise<void> {
  const argv = minimist(process.argv.slice(2), {
    string: ["repo", "agents", "base", "theme", "strategy", "privacy", "time-limit"],
    boolean: ["help"],
    alias: {
      h: "help"
    }
  });

  if (argv.help) {
    printHelp();
    return;
  }

  const subcommand = argv._[0];
  const repoPath = resolveRepoPath(argv);

  if (!subcommand || typeof subcommand !== "string") {
    await launchTui({ repoPath });
    return;
  }

  if (!(await isGitRepository(repoPath))) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  if (subcommand === "run") {
    const prompt = String(argv._[1] ?? "").trim();
    const providers = parseAgentsArg(argv.agents);
    const promptStrategy = parsePromptStrategy(argv.strategy);
    const baseBranchMode = parseBaseBranchMode(argv.base);
    const privacy = parsePrivacy(argv.privacy);
    const timeLimitSeconds = parseTimeLimit(argv["time-limit"]);
    const baseBranchTheme = typeof argv.theme === "string" ? argv.theme.trim() : undefined;

    if (prompt.length === 0) {
      throw new Error("Prompt is required: gg run \"<prompt>\" --agents claude codex");
    }
    if (providers.length < 2) {
      throw new Error("At least two agents are required for headless run.");
    }

    await runHeadless(repoPath, prompt, providers, {
      promptStrategy,
      baseBranchMode,
      baseBranchTheme: baseBranchTheme && baseBranchTheme.length > 0 ? baseBranchTheme : undefined,
      timeLimitSeconds,
      privacy
    });
    return;
  }

  if (subcommand === "stats" || subcommand === "leaderboard") {
    const db = openDatabase();
    try {
      printJson(getLeaderboard(db));
    } finally {
      db.close();
    }
    return;
  }

  if (subcommand === "history") {
    const db = openDatabase();
    try {
      printJson(getRecentMatches(db, 50));
    } finally {
      db.close();
    }
    return;
  }

  if (subcommand === "profile") {
    const provider = String(argv._[1] ?? "").trim();
    if (provider.length === 0) {
      throw new Error("Usage: gg profile <provider>");
    }

    const db = openDatabase();
    try {
      printJson(getAgentProfile(db, provider));
    } finally {
      db.close();
    }
    return;
  }

  if (subcommand === "h2h") {
    const providerA = String(argv._[1] ?? "").trim();
    const providerB = String(argv._[2] ?? "").trim();

    if (providerA.length === 0 || providerB.length === 0) {
      throw new Error("Usage: gg h2h <providerA> <providerB>");
    }

    const db = openDatabase();
    try {
      printJson(getHeadToHead(db, providerA, providerB));
    } finally {
      db.close();
    }
    return;
  }

  if (subcommand === "thread") {
    const matchId = String(argv._[1] ?? "").trim();
    const agentId = String(argv._[2] ?? "").trim();

    if (matchId.length === 0 || agentId.length === 0) {
      throw new Error("Usage: gg thread <matchId> <agentId>");
    }

    const matchDir = path.join(process.env.HOME ?? "", ".local", "share", "gg", "matches", matchId);
    const candidates = [
      path.join(matchDir, `${agentId}.thread.json`),
      path.join(matchDir, `${agentId.split("-")[0]}.thread.json`)
    ];
    const thread = candidates.map((candidate) => readThreadFromFile(candidate)).find((item) => item !== null) ?? null;
    printJson(thread);
    return;
  }

  if (subcommand === "clean") {
    const config = loadConfig(repoPath);
    const state = await scanRecoveryState({
      repoPath,
      worktreeDir: config.gg.worktree_dir,
      dbPath: defaultDatabasePath()
    });

    await cleanRecoveryState({
      repoPath,
      branches: state.danglingBranches,
      worktrees: state.orphanedWorktrees
    });

    printJson({ cleaned: true, branches: state.danglingBranches.length, worktrees: state.orphanedWorktrees.length });
    return;
  }

  if (subcommand === "config") {
    const key = String(argv._[1] ?? "").trim();
    const value = String(argv._[2] ?? "").trim();

    if (!key || !value) {
      throw new Error("Usage: gg config <allowSecrets|leaderboard> <true|false>");
    }

    updateLocalConfig(repoPath, key, value);
    process.stdout.write(`Updated ${key}=${value} in ${path.join(repoPath, "gg.toml")}\n`);
    return;
  }

  throw new Error(`Unknown command '${subcommand}'`);
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isEntrypoint) {
  void run().catch((error: Error) => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { run as runCli };
