import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { createDefaultExecutorRegistry } from "../agents/registry.js";
import type { AgentExecutor, AgentProcessHandle } from "../agents/types.js";
import type { RepoConfig } from "../config/config.js";
import type { AgentConfig } from "../config/defaults.js";
import { validateRepo } from "../lib/git.js";
import { applyPrivacy } from "../leaderboard/privacy.js";
import { writeMatchRecord } from "../leaderboard/exporter.js";
import { cleanupMatchWorkspaces, createAgentWorkspace, createMatchId, slugifyPrompt } from "./branch.js";
import { runChecks } from "./checks.js";
import { buildEffectivePrompt } from "./prompt.js";
import {
  buildInitialMatchStats,
  collectGitDiffStats,
  finalizeAgentStats,
  finalizeMatchStats,
  type RuntimeAgentMetrics
} from "./stats.js";
import { ThreadRecorder } from "./thread.js";
import type { AgentEntry, CheckResult, Match, MatchRecord, PromptStrategy, ThreadEvent } from "./types.js";
import { createSafetyWatcher, type SafetyViolation, type WatcherHandle } from "../safety/watcher.js";
import { normalizeGuardRules } from "../safety/guard.js";
import { DEFAULT_BLOCKED_SECRET_PATTERNS } from "../safety/secrets.js";

export interface StartMatchInput {
  prompt: string;
  providers: string[];
  timeLimitSeconds?: number;
  privacy?: "public" | "private" | "anonymous";
  promptStrategy?: PromptStrategy;
}

export interface MatchEngineOptions {
  repoPath: string;
  worktreeDir?: string;
  matchesDir?: string;
  now?: () => Date;
  executors?: Record<string, AgentExecutor>;
  agentConfigs?: Record<string, AgentConfig>;
  repoConfig?: RepoConfig;
  allowSecrets?: boolean;
}

export interface AgentOutputEvent {
  matchId: string;
  agentId: string;
  provider: string;
  stream: "stdout" | "stderr";
  chunk: string;
}

export interface MatchCallbacks {
  onMatchUpdated?: (match: Match) => void;
  onAgentUpdated?: (agent: AgentEntry, match: Match) => void;
  onAgentOutput?: (event: AgentOutputEvent) => void;
  onThreadEvent?: (agent: AgentEntry, event: ThreadEvent, match: Match) => void;
  onRiskFlag?: (agent: AgentEntry, reason: string, match: Match) => void;
  onFinished?: (match: Match) => void;
}

interface AgentRuntime {
  entry: AgentEntry;
  recorder: ThreadRecorder;
  logStream: fs.WriteStream;
  watcher?: WatcherHandle;
  process?: AgentProcessHandle;
  startedAt?: Date;
  firstOutputAt?: Date;
  completedAt?: Date;
  totalOutputChars: number;
  settled: boolean;
}

interface ActiveRun {
  match: Match;
  input: StartMatchInput;
  callbacks: MatchCallbacks;
  agents: Map<string, AgentRuntime>;
  timeoutTimer?: NodeJS.Timeout;
  stopRequested: boolean;
  timeoutTriggered: boolean;
  cancellationRequested: boolean;
  done: Promise<Match>;
  resolveDone: (match: Match) => void;
  rejectDone: (error: Error) => void;
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function agentOutcomeFromStatus(status: AgentEntry["status"]): "winner" | "loser" | "dnf" | undefined {
  if (status === "failed" || status === "timeout") {
    return "dnf";
  }
  return undefined;
}

export class MatchEngine {
  private readonly repoPath: string;
  private readonly worktreeDir: string;
  private readonly matchesDir: string;
  private readonly now: () => Date;
  private readonly executors: Record<string, AgentExecutor>;
  private readonly agentConfigs: Record<string, AgentConfig>;
  private readonly repoConfig: RepoConfig;
  private readonly allowSecrets: boolean;

  private readonly matches = new Map<string, Match>();
  private readonly runs = new Map<string, ActiveRun>();

  constructor(options: MatchEngineOptions) {
    this.repoPath = options.repoPath;
    this.worktreeDir = options.worktreeDir ?? ".gg-worktrees";
    this.matchesDir = options.matchesDir ?? path.join(os.homedir(), ".local", "share", "gg", "matches");
    this.now = options.now ?? (() => new Date());
    this.executors = {
      ...createDefaultExecutorRegistry(),
      ...(options.executors ?? {})
    };
    this.agentConfigs = options.agentConfigs ?? {};
    this.repoConfig = options.repoConfig ?? {};
    this.allowSecrets = options.allowSecrets ?? false;
  }

  getMatch(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  async startMatch(input: StartMatchInput, callbacks: MatchCallbacks = {}): Promise<Match> {
    const validation = await validateRepo(this.repoPath);
    if (!validation.isGitRepo) {
      throw new Error(`Not a git repository: ${this.repoPath}`);
    }
    if (!validation.isClean) {
      const hint = validation.changedFiles.slice(0, 8).join(", ");
      throw new Error(`Working tree must be clean before starting a match. Changed files: ${hint}`);
    }
    if (input.providers.length < 2) {
      throw new Error("At least two agents are required for a match.");
    }

    const matchId = createMatchId(this.now());
    const slug = slugifyPrompt(input.prompt);
    const promptStrategy = input.promptStrategy ?? "plain";
    const effectivePrompt = buildEffectivePrompt(input.prompt, promptStrategy);

    const git = simpleGit(this.repoPath);
    const baseBranch = (await git.branchLocal()).current;

    const logDir = path.join(this.matchesDir, matchId);
    fs.mkdirSync(logDir, { recursive: true });

    const createdAgents: AgentEntry[] = [];

    try {
      for (const [index, provider] of input.providers.entries()) {
        const workspace = await createAgentWorkspace({
          repoPath: this.repoPath,
          matchId,
          provider,
          slug,
          baseBranch,
          worktreeDir: this.worktreeDir
        });

        createdAgents.push({
          id: `${provider}-${index + 1}`,
          provider,
          branch: workspace.branch,
          worktreePath: workspace.worktreePath,
          status: "waiting",
          tokensUsed: 0,
          costUSD: 0,
          logPath: path.join(logDir, `${provider}.log`),
          threadPath: path.join(logDir, `${provider}.thread.json`),
          riskFlags: []
        });
      }
    } catch (error) {
      await cleanupMatchWorkspaces(
        this.repoPath,
        createdAgents.map((agent) => ({
          provider: agent.provider,
          branch: agent.branch,
          worktreePath: agent.worktreePath
        }))
      ).catch(() => undefined);
      throw error;
    }

    const match: Match = {
      id: matchId,
      prompt: input.prompt,
      effectivePrompt,
      promptStrategy,
      repo: this.repoPath,
      baseBranch,
      agents: createdAgents,
      status: "branching",
      startedAt: this.now(),
      stats: {
        matchId,
        prompt: input.prompt,
        duration: 0,
        agentStats: []
      },
      checks: {},
      privacy: input.privacy ?? "private",
      logDir
    };
    match.stats = buildInitialMatchStats(match);

    const deferred = createDeferred<Match>();

    const run: ActiveRun = {
      match,
      input,
      callbacks,
      agents: new Map<string, AgentRuntime>(),
      stopRequested: false,
      timeoutTriggered: false,
      cancellationRequested: false,
      done: deferred.promise,
      resolveDone: deferred.resolve,
      rejectDone: deferred.reject
    };

    for (const agent of match.agents) {
      const logStream = fs.createWriteStream(agent.logPath, { flags: "a" });
      const recorder = new ThreadRecorder(
        match.id,
        agent.id,
        agent.provider,
        match.prompt,
        match.effectivePrompt,
        match.promptStrategy
      );

      run.agents.set(agent.id, {
        entry: agent,
        recorder,
        logStream,
        totalOutputChars: 0,
        settled: false
      });
    }

    this.matches.set(match.id, match);
    this.runs.set(match.id, run);

    this.setMatchStatus(run, "running");
    void this.runMatchLifecycle(run);

    return match;
  }

  waitForMatch(matchId: string): Promise<Match> {
    const run = this.runs.get(matchId);
    if (run) {
      return run.done;
    }

    const match = this.matches.get(matchId);
    if (match) {
      return Promise.resolve(match);
    }

    return Promise.reject(new Error(`Unknown match: ${matchId}`));
  }

  async stopAgents(matchId: string): Promise<void> {
    const run = this.runs.get(matchId);
    if (!run) {
      return;
    }

    run.stopRequested = true;
    for (const runtime of run.agents.values()) {
      if (runtime.entry.status === "running" || runtime.entry.status === "spawning") {
        runtime.process?.kill("SIGINT");
      }
    }
  }

  async cancelMatch(matchId: string): Promise<void> {
    const run = this.runs.get(matchId);
    if (!run) {
      return;
    }

    run.cancellationRequested = true;
    await this.stopAgents(matchId);

    await run.done.catch(() => undefined);

    await cleanupMatchWorkspaces(
      this.repoPath,
      run.match.agents.map((agent) => ({
        provider: agent.provider,
        branch: agent.branch,
        worktreePath: agent.worktreePath
      }))
    ).catch(() => undefined);

    run.match.status = "cancelled";
    run.match.endedAt = this.now();
    this.matches.set(run.match.id, run.match);
    this.runs.delete(run.match.id);
  }

  async mergeWinner(matchId: string, winnerAgentId: string): Promise<Match> {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error(`Unknown match: ${matchId}`);
    }

    const winner = match.agents.find((agent) => agent.id === winnerAgentId);
    if (!winner) {
      throw new Error(`Unknown winner agent: ${winnerAgentId}`);
    }

    const git = simpleGit(this.repoPath);
    await git.checkout(match.baseBranch);
    await git.merge([winner.branch]);

    match.winnerId = winner.id;
    match.mergedBranch = winner.branch;

    for (const stat of match.stats.agentStats) {
      stat.outcome = stat.agentId === winner.id ? "winner" : stat.outcome ?? "loser";
    }

    await cleanupMatchWorkspaces(
      this.repoPath,
      match.agents.map((agent) => ({
        provider: agent.provider,
        branch: agent.branch,
        worktreePath: agent.worktreePath
      }))
    );

    match.status = "merged";
    this.matches.set(match.id, match);
    this.runs.delete(match.id);

    return match;
  }

  private async runMatchLifecycle(run: ActiveRun): Promise<void> {
    try {
      const agentPromises = run.match.agents.map((agent) => this.spawnAndTrackAgent(run, agent.id));

      if (run.input.timeLimitSeconds && run.input.timeLimitSeconds > 0) {
        run.timeoutTimer = setTimeout(() => {
          run.timeoutTriggered = true;
          void this.stopAgents(run.match.id);
        }, run.input.timeLimitSeconds * 1000);
      }

      await Promise.all(agentPromises);
      await this.finalizeMatch(run);

      run.resolveDone(run.match);
      run.callbacks.onFinished?.(run.match);
    } catch (error) {
      run.rejectDone(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (run.timeoutTimer) {
        clearTimeout(run.timeoutTimer);
      }
      this.runs.delete(run.match.id);
      this.matches.set(run.match.id, run.match);
    }
  }

  private async spawnAndTrackAgent(run: ActiveRun, agentId: string): Promise<void> {
    const runtime = run.agents.get(agentId);
    if (!runtime) {
      return;
    }

    const agent = runtime.entry;
    const executor = this.executors[agent.provider];

    if (!executor) {
      this.setAgentStatus(run, runtime, "failed");
      this.pushRiskFlag(run, runtime, `No executor configured for provider '${agent.provider}'`);
      runtime.logStream.end();
      runtime.recorder.push({
        type: "agent_exited",
        timestamp: this.now().toISOString(),
        code: 127,
        signal: "NO_EXECUTOR"
      });
      runtime.recorder.writeToFile(agent.threadPath);
      runtime.settled = true;
      return;
    }

    const providerConfig = this.agentConfigs[agent.provider];
    const command = providerConfig?.command;
    const args = providerConfig?.args;

    const guardRules = normalizeGuardRules(this.repoConfig.guard);
    if (guardRules.allow.length > 0 || guardRules.deny.length > 0 || !this.allowSecrets) {
      runtime.watcher = createSafetyWatcher(agent.worktreePath, {
        blockedSecretPatterns: this.allowSecrets ? [] : DEFAULT_BLOCKED_SECRET_PATTERNS,
        guardRules,
        onViolation: (violation) => this.onSafetyViolation(run, runtime, violation)
      });
    }

    this.setAgentStatus(run, runtime, "spawning");
    runtime.startedAt = this.now();
    agent.startedAt = runtime.startedAt;

    runtime.recorder.push({
      type: "command_executed",
      timestamp: this.now().toISOString(),
      command: [command ?? providerConfig?.command ?? agent.provider, ...(args ?? [])].join(" ")
    });

    await new Promise<void>((resolve) => {
      const settleOnce = (status: AgentEntry["status"], code: number, signal?: string): void => {
        if (runtime.settled) {
          return;
        }

        runtime.settled = true;
        runtime.completedAt = this.now();
        agent.completedAt = runtime.completedAt;

        this.setAgentStatus(run, runtime, status);

        runtime.recorder.push({
          type: "agent_exited",
          timestamp: runtime.completedAt.toISOString(),
          code,
          signal
        });

        runtime.watcher?.close();
        runtime.logStream.end();
        runtime.recorder.writeToFile(agent.threadPath);

        resolve();
      };

      void executor
        .spawn(
          agent,
          {
            prompt: run.match.effectivePrompt,
            worktreePath: agent.worktreePath,
            logPath: agent.logPath,
            command,
            args,
            env: {
              ...process.env,
              ...(providerConfig?.env ?? {})
            },
            timeLimitSeconds: run.input.timeLimitSeconds
          },
          {
            onStart: (pid) => {
              agent.pid = pid;
              this.setAgentStatus(run, runtime, "running");
              runtime.recorder.push({
                type: "agent_started",
                timestamp: this.now().toISOString(),
                pid: pid ?? 0
              });
            },
            onStdout: (chunk) => this.onAgentOutput(run, runtime, "stdout", chunk),
            onStderr: (chunk) => this.onAgentOutput(run, runtime, "stderr", chunk),
            onExit: (code, signal) => {
              const normalizedCode = code ?? 1;
              const normalizedSignal = signal ?? undefined;

              if (run.timeoutTriggered) {
                settleOnce("timeout", normalizedCode, normalizedSignal);
                return;
              }

              if (run.stopRequested && normalizedCode !== 0) {
                settleOnce("failed", normalizedCode, normalizedSignal ?? "SIGINT");
                return;
              }

              if (normalizedCode === 0) {
                settleOnce("completed", 0, normalizedSignal);
              } else {
                settleOnce("failed", normalizedCode, normalizedSignal);
              }
            },
            onError: (error) => {
              this.pushRiskFlag(run, runtime, error.message);
              settleOnce("failed", 1, "ERROR");
            }
          }
        )
        .then((handle) => {
          runtime.process = handle;
        })
        .catch((error: Error) => {
          this.pushRiskFlag(run, runtime, error.message);
          settleOnce("failed", 1, "SPAWN_ERROR");
        });
    });
  }

  private async finalizeMatch(run: ActiveRun): Promise<void> {
    const match = run.match;
    match.endedAt = this.now();

    const checks = this.repoConfig.checks ?? [];
    const stats = [];

    for (const agent of match.agents) {
      const runtime = run.agents.get(agent.id);
      if (!runtime) {
        continue;
      }

      const gitStats = await collectGitDiffStats(this.repoPath, match.baseBranch, agent.branch).catch(() => ({
        filesChanged: 0,
        filesAdded: 0,
        filesDeleted: 0,
        insertions: 0,
        deletions: 0,
        netLines: 0,
        commits: 0
      }));

      let checkResults: CheckResult[] = [];
      if (checks.length > 0) {
        const checksOutputDir = path.join(match.logDir, "checks", agent.provider);
        checkResults = await runChecks({
          cwd: agent.worktreePath,
          checks,
          outputDir: checksOutputDir
        });

        match.checks = match.checks ?? {};
        match.checks[agent.id] = checkResults;

        for (const check of checkResults) {
          runtime.recorder.push({
            type: "check_result",
            timestamp: this.now().toISOString(),
            name: check.name,
            passed: check.passed,
            output: check.outputPath
          });
          run.callbacks.onThreadEvent?.(
            agent,
            {
              type: "check_result",
              timestamp: this.now().toISOString(),
              name: check.name,
              passed: check.passed,
              output: check.outputPath
            },
            match
          );
        }

        runtime.recorder.writeToFile(agent.threadPath);
      }

      const runtimeMetrics: RuntimeAgentMetrics = {
        startedAt: runtime.startedAt,
        firstOutputAt: runtime.firstOutputAt,
        completedAt: runtime.completedAt,
        totalOutputChars: runtime.totalOutputChars
      };

      const agentStat = finalizeAgentStats(agent, runtimeMetrics, gitStats, run.input.timeLimitSeconds);
      agentStat.checksResults = checkResults ?? [];
      agentStat.outcome = agentOutcomeFromStatus(agent.status);

      stats.push(agentStat);
    }

    match.stats = finalizeMatchStats(match, stats);
    match.status = run.cancellationRequested ? "cancelled" : "reviewing";

    const record: MatchRecord = {
      matchId: match.id,
      privacy: match.privacy,
      repo: path.basename(match.repo),
      prompt: match.prompt,
      agents: match.agents.map((agent) => agent.provider),
      winner: match.winnerId ?? null,
      durationSeconds: match.stats.duration,
      agentStats: match.stats.agentStats.map((item) => ({
        provider: item.provider,
        model: item.model,
        timeToCompletion: item.timeToCompletion,
        filesChanged: item.filesChanged,
        insertions: item.insertions,
        deletions: item.deletions,
        tokensUsed: item.tokensUsed,
        costUSD: item.costUSD,
        checksPassed: item.checksResults?.every((check) => check.passed),
        riskFlags: item.riskFlags
      })),
      timestamp: this.now().toISOString()
    };

    writeMatchRecord(match.logDir, applyPrivacy(record));

    this.emitMatchUpdated(run);
  }

  private onAgentOutput(
    run: ActiveRun,
    runtime: AgentRuntime,
    stream: "stdout" | "stderr",
    chunk: string
  ): void {
    const timestamp = this.now().toISOString();

    runtime.totalOutputChars += chunk.length;
    if (!runtime.firstOutputAt && stream === "stdout" && chunk.trim().length > 0) {
      runtime.firstOutputAt = this.now();
    }

    runtime.logStream.write(chunk);

    const event: ThreadEvent = {
      type: stream,
      timestamp,
      content: chunk
    };

    runtime.recorder.push(event);
    run.callbacks.onThreadEvent?.(runtime.entry, event, run.match);
    run.callbacks.onAgentOutput?.({
      matchId: run.match.id,
      agentId: runtime.entry.id,
      provider: runtime.entry.provider,
      stream,
      chunk
    });
  }

  private onSafetyViolation(run: ActiveRun, runtime: AgentRuntime, violation: SafetyViolation): void {
    const reason = `${violation.type}: ${violation.reason} (${violation.path})`;
    this.pushRiskFlag(run, runtime, reason, violation.path);
  }

  private pushRiskFlag(run: ActiveRun, runtime: AgentRuntime, reason: string, pathHint?: string): void {
    const flag = pathHint ? `${reason}` : reason;
    if (!runtime.entry.riskFlags.includes(flag)) {
      runtime.entry.riskFlags.push(flag);
    }

    const event: ThreadEvent = {
      type: "risk_flag",
      timestamp: this.now().toISOString(),
      reason,
      path: pathHint
    };

    runtime.recorder.push(event);
    run.callbacks.onThreadEvent?.(runtime.entry, event, run.match);
    run.callbacks.onRiskFlag?.(runtime.entry, reason, run.match);
    this.emitAgentUpdated(run, runtime.entry);
  }

  private setMatchStatus(run: ActiveRun, status: Match["status"]): void {
    run.match.status = status;
    this.emitMatchUpdated(run);
  }

  private setAgentStatus(run: ActiveRun, runtime: AgentRuntime, status: AgentEntry["status"]): void {
    runtime.entry.status = status;
    this.emitAgentUpdated(run, runtime.entry);
  }

  private emitAgentUpdated(run: ActiveRun, agent: AgentEntry): void {
    run.callbacks.onAgentUpdated?.(agent, run.match);
    this.emitMatchUpdated(run);
  }

  private emitMatchUpdated(run: ActiveRun): void {
    run.callbacks.onMatchUpdated?.(run.match);
  }
}
