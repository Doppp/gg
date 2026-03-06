import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { execa } from "execa";
import { createTempDir, initGitRepo } from "./git.js";

export interface E2EFixture {
  rootDir: string;
  repoPath: string;
  homeDir: string;
  binDir: string;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function tsxCliPath(): string {
  return path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
}

function cliEntrypointPath(): string {
  return path.join(repoRoot(), "src", "cli.ts");
}

function writeExecutable(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function writeFakeAgentCli(binDir: string, provider: "claude" | "codex"): void {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const provider = ${JSON.stringify(provider)};
const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write(provider + "-fake 1.0.0\\n");
  process.exit(0);
}

let prompt = "";
for (let index = 0; index < args.length; index += 1) {
  if ((provider === "claude" && args[index] === "-p") || (provider === "codex" && args[index] === "--prompt")) {
    prompt = args[index + 1] || "";
  }
}

process.stdout.write("[" + provider + "] prompt=" + JSON.stringify(prompt) + "\\n");
process.stderr.write("[" + provider + "] stderr stream active\\n");

const fileName = provider + ".txt";
const filePath = path.join(process.cwd(), fileName);
fs.writeFileSync(filePath, provider + "\\n" + prompt + "\\n", "utf8");

const add = spawnSync("git", ["add", fileName], { cwd: process.cwd(), stdio: "pipe" });
if (add.status !== 0) {
  process.stderr.write((add.stderr || Buffer.from("")).toString("utf8"));
  process.exit(add.status || 1);
}

const commit = spawnSync("git", ["commit", "-m", provider + " update"], { cwd: process.cwd(), stdio: "pipe" });
if (commit.status !== 0) {
  process.stderr.write((commit.stderr || Buffer.from("")).toString("utf8"));
  process.exit(commit.status || 1);
}

process.stdout.write("[" + provider + "] committed changes\\n");
`;

  writeExecutable(path.join(binDir, provider), script);
}

function writeHomeConfig(homeDir: string): void {
  const configDir = path.join(homeDir, ".config", "gg");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "gg.toml"),
    `[gg]
theme = "dark"
default_time_limit = 0
worktree_dir = ".gg-worktrees"
default_prompt_strategy = "competition"

[agents.claude]
enabled = true
command = "claude"
args = ["--dangerously-skip-permissions"]

[agents.codex]
enabled = true
command = "codex"
args = []

[cost]
match_budget_usd = 5.00
daily_budget_usd = 20.00
warn_threshold = 0.8

[safety]
allow_secrets = false

[leaderboard]
enabled = false
default_privacy = "private"
`,
    "utf8"
  );
}

function writeRepoConfig(repoPath: string): void {
  fs.writeFileSync(
    path.join(repoPath, "gg.config.json"),
    JSON.stringify(
      {
        checks: ['node -e "process.exit(0)"'],
        review: {
          test: 'node -e "process.exit(0)"',
          run: 'node -e "console.log(\\"review run ok\\")"'
        }
      },
      null,
      2
    ),
    "utf8"
  );

  execSync("git add gg.config.json", { cwd: repoPath, stdio: "pipe" });
  execSync('git commit -m "add gg config"', { cwd: repoPath, stdio: "pipe" });
}

export function createE2EFixture(prefix = "gg-e2e-"): E2EFixture {
  const rootDir = createTempDir(prefix);
  const repoPath = path.join(rootDir, "repo");
  const homeDir = path.join(rootDir, "home");
  const binDir = path.join(rootDir, "bin");

  fs.mkdirSync(repoPath, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  initGitRepo(repoPath);
  writeHomeConfig(homeDir);
  writeRepoConfig(repoPath);
  writeFakeAgentCli(binDir, "claude");
  writeFakeAgentCli(binDir, "codex");

  return {
    rootDir,
    repoPath,
    homeDir,
    binDir
  };
}

export function removeE2EFixture(fixture: E2EFixture): void {
  if (fs.existsSync(fixture.rootDir)) {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
}

export async function runGgCommand(
  fixture: E2EFixture,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa(process.execPath, [tsxCliPath(), cliEntrypointPath(), ...args], {
    cwd: repoRoot(),
    reject: false,
    env: {
      ...process.env,
      ...extraEnv,
      HOME: fixture.homeDir,
      PATH: [fixture.binDir, process.env.PATH ?? ""].filter((item) => item.length > 0).join(path.delimiter)
    }
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0
  };
}

export function parseJsonOutput<T>(output: string): T {
  const trimmed = output.trim();
  const objectIndex = trimmed.indexOf("{");
  const arrayIndex = trimmed.indexOf("[");
  const indices = [objectIndex, arrayIndex].filter((index) => index >= 0);

  if (indices.length === 0) {
    throw new Error(`No JSON found in output:\n${output}`);
  }

  const startIndex = Math.min(...indices);
  return JSON.parse(trimmed.slice(startIndex)) as T;
}

export function parseStartedMatchId(output: string): string {
  const match = output.match(/Started match (\S+)/);
  if (!match) {
    throw new Error(`No match id found in output:\n${output}`);
  }
  return match[1];
}

export function artifactsDirForMatch(fixture: E2EFixture, matchId: string): string {
  return path.join(fixture.homeDir, ".local", "share", "gg", "matches", matchId);
}

export function databasePathForFixture(fixture: E2EFixture): string {
  return path.join(fixture.homeDir, ".local", "share", "gg", "gg.db");
}
