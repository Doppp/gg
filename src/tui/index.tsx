import path from "node:path";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type Database from "better-sqlite3";
import { detectInstalledAgents } from "../agents/detector.js";
import { loadConfig, loadRepoConfig, type RepoConfig } from "../config/config.js";
import { DEFAULT_CONFIG, type GGConfig } from "../config/defaults.js";
import { getRepoName, validateRepo } from "../lib/git.js";
import { MatchEngine } from "../match/engine.js";
import { readThreadFromFile } from "../match/thread.js";
import type { AgentEntry, Match, MatchThread as MatchThreadType } from "../match/types.js";
import { diffBranches } from "../preview/diff.js";
import { switchPreviewBranch } from "../preview/worktree.js";
import { scanRecoveryState } from "../recovery/recovery.js";
import { normalizeGuardRules } from "../safety/guard.js";
import { scanForSecretFiles } from "../safety/secrets.js";
import { defaultDatabasePath, openDatabase } from "../store/sqlite.js";
import {
  getAgentProfile,
  getHeadToHead,
  getLeaderboard,
  getRecentMatches,
  persistMatch,
  type LeaderboardRow,
  type MatchListItem
} from "../store/queries.js";
import { AgentProfile } from "./components/AgentProfile.js";
import { BranchPreview } from "./components/BranchPreview.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { MatchHistory } from "./components/MatchHistory.js";
import { MatchSetup, type SetupAgentOption } from "./components/MatchSetup.js";
import { MatchThread } from "./components/MatchThread.js";
import { PostMatch } from "./components/PostMatch.js";
import { SplitPane } from "./components/SplitPane.js";
import { StatusBar, type StatusMode } from "./components/StatusBar.js";
import type { LiveAgentPaneModel } from "./components/AgentPane.js";

type ViewId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface AppProps {
  repoPath: string;
}

function viewLabel(view: ViewId): string {
  if (view === 1) return "Match Setup";
  if (view === 2) return "Live Match";
  if (view === 3) return "Post-Match Stats";
  if (view === 4) return "Match Thread";
  if (view === 5) return "Leaderboard";
  if (view === 6) return "Match History";
  return "Agent Profile";
}

function appendChunkLines(lines: string[], chunk: string, maxLines = 80): string[] {
  const next = [...lines];
  for (const line of chunk.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }
    next.push(line);
  }

  if (next.length > maxLines) {
    return next.slice(next.length - maxLines);
  }

  return next;
}

function statusFromMatch(match: Match): StatusMode {
  if (match.status === "setup") return "setup";
  if (match.status === "branching") return "branching";
  if (match.status === "running") return "racing";
  if (match.status === "reviewing" || match.status === "decided") return "reviewing";
  return "merged";
}

export function App({ repoPath }: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const repoName = useMemo(() => getRepoName(repoPath), [repoPath]);

  const dbRef = useRef<Database.Database | null>(null);
  const engineRef = useRef<MatchEngine | null>(null);

  const [activeView, setActiveView] = useState<ViewId>(1);
  const [showHelp, setShowHelp] = useState(false);

  const [config, setConfig] = useState<GGConfig>(DEFAULT_CONFIG);
  const [repoConfig, setRepoConfig] = useState<RepoConfig>({});
  const [detectedAgents, setDetectedAgents] = useState<SetupAgentOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [selectedAgentProviders, setSelectedAgentProviders] = useState<string[]>([]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(
    DEFAULT_CONFIG.gg.default_time_limit > 0 ? DEFAULT_CONFIG.gg.default_time_limit : null
  );

  const [baseBranch, setBaseBranch] = useState("main");
  const [repoIsClean, setRepoIsClean] = useState(true);
  const [statusMode, setStatusMode] = useState<StatusMode>("setup");
  const [notice, setNotice] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [livePanes, setLivePanes] = useState<Record<string, LiveAgentPaneModel>>({});
  const [postMatchAgentIndex, setPostMatchAgentIndex] = useState(0);
  const [thread, setThread] = useState<MatchThreadType | undefined>(undefined);
  const [diffPreview, setDiffPreview] = useState<string>("");

  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [historyRows, setHistoryRows] = useState<MatchListItem[]>([]);
  const [leaderboardSort, setLeaderboardSort] = useState<"winRate" | "matches" | "cost">("winRate");

  const [selectedProfileProvider, setSelectedProfileProvider] = useState<string | null>(null);
  const [h2hSummary, setH2hSummary] = useState<string>("");

  useEffect(() => {
    dbRef.current = openDatabase();
    return () => {
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  function refreshStoredData(): void {
    const db = dbRef.current;
    if (!db) {
      return;
    }

    const leaderboard = getLeaderboard(db);
    const history = getRecentMatches(db, 30);

    setLeaderboardRows(leaderboard);
    setHistoryRows(history);

    const provider = selectedProfileProvider ?? leaderboard[0]?.provider ?? null;
    setSelectedProfileProvider(provider);

    if (provider && leaderboard.length > 1) {
      const opponent = leaderboard.find((row) => row.provider !== provider)?.provider;
      if (opponent) {
        const h2h = getHeadToHead(db, provider, opponent);
        setH2hSummary(`${provider} vs ${opponent}: ${h2h.aWins}-${h2h.bWins}`);
      }
    }
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap(): Promise<void> {
      try {
        const loadedConfig = loadConfig(repoPath);
        const loadedRepoConfig = loadRepoConfig(repoPath);
        const validation = await validateRepo(repoPath);

        if (!validation.isGitRepo) {
          throw new Error(`Not a git repository: ${repoPath}`);
        }

        const detected = await detectInstalledAgents(loadedConfig);
        const secretScan = scanForSecretFiles(repoPath);
        const recovery = await scanRecoveryState({
          repoPath,
          worktreeDir: loadedConfig.gg.worktree_dir,
          dbPath: defaultDatabasePath()
        });

        const startupWarnings: string[] = [];
        if (!validation.isClean) {
          startupWarnings.push(
            `Working tree is dirty (${validation.changedFiles.length} changed). Clean or stash changes before starting.`
          );
        }
        if (!loadedConfig.safety.allow_secrets && secretScan.matchingFiles.length > 0) {
          startupWarnings.push(`Secret-like files detected: ${secretScan.matchingFiles.slice(0, 3).join(", ")}`);
        }

        const guardRules = normalizeGuardRules(loadedRepoConfig.guard);
        if (guardRules.allow.length > 0 || guardRules.deny.length > 0) {
          startupWarnings.push(`Guard mode active (allow: ${guardRules.allow.length}, deny: ${guardRules.deny.length}).`);
        }

        if (
          recovery.danglingBranches.length > 0 ||
          recovery.orphanedWorktrees.length > 0 ||
          recovery.unfinishedMatches.length > 0
        ) {
          startupWarnings.push(
            `Recovery found ${recovery.danglingBranches.length} branches, ${recovery.orphanedWorktrees.length} orphaned worktrees, ${recovery.unfinishedMatches.length} unfinished matches.`
          );
        }

        const availableAgents = detected.map((agent) => ({
          provider: agent.provider,
          command: agent.command,
          version: agent.version
        }));

        if (availableAgents.length < 2) {
          availableAgents.push({
            provider: "mock",
            command: "mock",
            version: "builtin"
          });
        }

        if (!mounted) {
          return;
        }

        setConfig(loadedConfig);
        setRepoConfig(loadedRepoConfig);
        setTimeLimitSeconds(loadedConfig.gg.default_time_limit > 0 ? loadedConfig.gg.default_time_limit : null);
        setDetectedAgents(availableAgents);
        setSelectedAgentProviders(availableAgents.slice(0, 2).map((item) => item.provider));
        setBaseBranch(validation.currentBranch || "main");
        setRepoIsClean(validation.isClean);
        setWarnings(startupWarnings);

        if (availableAgents.length === 0) {
          setNotice("No supported agents detected. Install claude or codex CLI.");
        } else if (startupWarnings.length > 0) {
          setNotice(startupWarnings[0]);
        }

        refreshStoredData();
      } catch (error) {
        if (!mounted) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [repoPath]);

  useEffect(() => {
    if (statusMode !== "racing") {
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [statusMode]);

  function toggleAgent(provider: string): void {
    setSelectedAgentProviders((current) => {
      if (current.includes(provider)) {
        return current.filter((item) => item !== provider);
      }
      return [...current, provider];
    });
  }

  function resetSetup(): void {
    setStatusMode("setup");
    setActiveView(1);
    setElapsedSeconds(0);
    setCurrentMatch(null);
    setLivePanes({});
    setThread(undefined);
    setDiffPreview("");
    setPostMatchAgentIndex(0);
  }

  function selectedAgentCount(): number {
    if (currentMatch?.agents.length) {
      return currentMatch.agents.length;
    }
    return Math.max(1, selectedAgentProviders.length);
  }

  function cycleFocusedAgent(direction: "left" | "right"): void {
    setPostMatchAgentIndex((value) => {
      const length = selectedAgentCount();
      if (direction === "left") {
        return (value - 1 + length) % length;
      }
      return (value + 1) % length;
    });
  }

  async function startMatch(): Promise<void> {
    if (!repoIsClean) {
      setNotice("Cannot start: working tree is dirty. Commit/stash changes first.");
      return;
    }

    if (selectedAgentProviders.length < 2) {
      setNotice("Select at least two agents before starting a match.");
      return;
    }

    const engine = new MatchEngine({
      repoPath,
      worktreeDir: config.gg.worktree_dir,
      agentConfigs: config.agents,
      repoConfig,
      allowSecrets: config.safety.allow_secrets
    });
    engineRef.current = engine;

    setStatusMode("branching");
    setElapsedSeconds(0);
    setDiffPreview("");
    setThread(undefined);
    setPostMatchAgentIndex(0);

    setLivePanes(
      Object.fromEntries(
        selectedAgentProviders.map((provider, index) => [
          `${provider}-${index + 1}`,
          {
            id: `${provider}-${index + 1}`,
            provider,
            status: "waiting",
            lines: [],
            riskFlags: []
          } satisfies LiveAgentPaneModel
        ])
      )
    );

    try {
      const started = await engine.startMatch(
        {
          prompt,
          providers: selectedAgentProviders,
          timeLimitSeconds: timeLimitSeconds ?? undefined,
          privacy: config.leaderboard.default_privacy
        },
        {
          onMatchUpdated: (match) => {
            setCurrentMatch({ ...match, agents: [...match.agents], stats: { ...match.stats, agentStats: [...match.stats.agentStats] } });
            setStatusMode(statusFromMatch(match));
          },
          onAgentUpdated: (agent) => {
            setLivePanes((current) => {
              const prev = current[agent.id] ?? {
                id: agent.id,
                provider: agent.provider,
                status: "waiting",
                lines: [],
                riskFlags: []
              };

              return {
                ...current,
                [agent.id]: {
                  ...prev,
                  provider: agent.provider,
                  status: agent.status,
                  pid: agent.pid,
                  branch: agent.branch,
                  riskFlags: [...agent.riskFlags]
                }
              };
            });
          },
          onAgentOutput: (event) => {
            setLivePanes((current) => {
              const prev = current[event.agentId] ?? {
                id: event.agentId,
                provider: event.provider,
                status: "running",
                lines: [],
                riskFlags: []
              };

              return {
                ...current,
                [event.agentId]: {
                  ...prev,
                  lines: appendChunkLines(prev.lines, event.chunk)
                }
              };
            });
          },
          onFinished: (finishedMatch) => {
            const db = dbRef.current;
            if (db) {
              persistMatch(db, finishedMatch);
              refreshStoredData();
            }
            setNotice(`Match complete: ${finishedMatch.id}`);
            setActiveView(3);
          }
        }
      );

      setCurrentMatch(started);
      setActiveView(2);
      setStatusMode("racing");
      setNotice(`Running match ${started.id}`);

      void engine.waitForMatch(started.id).then((finished) => {
        setCurrentMatch({ ...finished, agents: [...finished.agents], stats: { ...finished.stats, agentStats: [...finished.stats.agentStats] } });
        setStatusMode(statusFromMatch(finished));
      });
    } catch (error) {
      setStatusMode("setup");
      setNotice(`Failed to start match: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function stopRunningMatch(): Promise<void> {
    if (!currentMatch || !engineRef.current) {
      return;
    }

    await engineRef.current.stopAgents(currentMatch.id);
    setNotice("Stop requested. Waiting for agents to exit...");
  }

  async function showDiffForSelectedAgent(): Promise<void> {
    if (!currentMatch) {
      return;
    }

    const selected = currentMatch.agents[postMatchAgentIndex] ?? currentMatch.agents[0];
    if (!selected) {
      return;
    }

    const diff = await diffBranches(repoPath, currentMatch.baseBranch, selected.branch);
    setDiffPreview(diff || "(no diff)");
    setNotice(`Showing diff for ${selected.provider}`);
  }

  async function switchPreviewForSelectedAgent(): Promise<void> {
    if (!currentMatch) {
      return;
    }

    const selected = currentMatch.agents[postMatchAgentIndex] ?? currentMatch.agents[0];
    if (!selected) {
      return;
    }

    const previewPath = path.join(repoPath, config.gg.worktree_dir, "preview");
    await switchPreviewBranch({
      repoPath,
      previewPath,
      baseBranch: currentMatch.baseBranch,
      targetBranch: selected.branch
    });

    setNotice(`Preview switched to ${selected.branch} at ${previewPath}`);
  }

  function viewThreadForSelectedAgent(): void {
    if (!currentMatch) {
      return;
    }

    const selected = currentMatch.agents[postMatchAgentIndex] ?? currentMatch.agents[0];
    if (!selected) {
      return;
    }

    const loaded = readThreadFromFile(selected.threadPath);
    if (!loaded) {
      setNotice(`No thread found at ${selected.threadPath}`);
      return;
    }

    setThread(loaded);
    setActiveView(4);
  }

  async function pickWinner(): Promise<void> {
    if (!currentMatch || !engineRef.current) {
      return;
    }

    const selected = currentMatch.agents[postMatchAgentIndex] ?? currentMatch.agents[0];
    if (!selected) {
      return;
    }

    try {
      const merged = await engineRef.current.mergeWinner(currentMatch.id, selected.id);
      setCurrentMatch(merged);
      setStatusMode("merged");
      setNotice(`${selected.provider} wins and was merged into ${merged.baseBranch}`);

      const db = dbRef.current;
      if (db) {
        persistMatch(db, merged);
        refreshStoredData();
      }
    } catch (error) {
      setNotice(`Merge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleQuit(): Promise<void> {
    if (statusMode === "racing" && currentMatch && engineRef.current) {
      setNotice("Cancelling running match and cleaning up...");
      await engineRef.current.cancelMatch(currentMatch.id);

      const cancelled = engineRef.current.getMatch(currentMatch.id);
      if (cancelled && dbRef.current) {
        persistMatch(dbRef.current, cancelled);
      }
    }

    exit();
  }

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "c") {
      void handleQuit();
      return;
    }

    if (showHelp) {
      if (key.escape || input === "?") {
        setShowHelp(false);
      }
      return;
    }

    if (input === "?") {
      setShowHelp(true);
      return;
    }

    if (activeView === 1 && isEditingPrompt) {
      if (key.escape) {
        setIsEditingPrompt(false);
      }
      return;
    }

    if (input === "q") {
      void handleQuit();
      return;
    }

    if (/^[1-7]$/.test(input)) {
      setActiveView(Number(input) as ViewId);
      return;
    }

    if (activeView === 1 && input === " ") {
      void startMatch();
      return;
    }

    if (activeView === 2 && input === "x") {
      void stopRunningMatch();
      return;
    }

    if ((activeView === 2 || activeView === 3) && key.leftArrow) {
      cycleFocusedAgent("left");
      return;
    }

    if ((activeView === 2 || activeView === 3) && key.rightArrow) {
      cycleFocusedAgent("right");
      return;
    }

    if (activeView === 3 && input === "d") {
      void showDiffForSelectedAgent();
      return;
    }

    if (activeView === 3 && input === "b") {
      void switchPreviewForSelectedAgent();
      return;
    }

    if (activeView === 3 && input === "v") {
      viewThreadForSelectedAgent();
      return;
    }

    if (activeView === 3 && input === "w") {
      void pickWinner();
      return;
    }

    if (activeView === 3 && input === "r") {
      void startMatch();
      return;
    }

    if (activeView === 3 && input === "n") {
      resetSetup();
      return;
    }

    if (activeView === 5 && input === "s") {
      setLeaderboardSort((value) => {
        if (value === "winRate") return "matches";
        if (value === "matches") return "cost";
        return "winRate";
      });
      return;
    }

    if (activeView === 6 && input === "/") {
      setNotice("History filtering is not yet implemented.");
      return;
    }

    if (activeView === 7 && key.return && leaderboardRows.length > 0) {
      const next = leaderboardRows[(leaderboardRows.findIndex((row) => row.provider === selectedProfileProvider) + 1) % leaderboardRows.length];
      if (next) {
        setSelectedProfileProvider(next.provider);
      }
      return;
    }

    if (key.escape) {
      setIsEditingPrompt(false);
    }
  });

  function renderView(): React.JSX.Element {
    if (loading) {
      return (
        <Box paddingX={1}>
          <Text>Loading config and detecting agents...</Text>
        </Box>
      );
    }

    if (loadError) {
      return (
        <Box paddingX={1}>
          <Text color="red">Failed to initialize: {loadError}</Text>
        </Box>
      );
    }

    if (activeView === 1) {
      return (
        <MatchSetup
          isActive={!showHelp}
          prompt={prompt}
          isEditingPrompt={isEditingPrompt}
          selectedAgentProviders={selectedAgentProviders}
          availableAgents={detectedAgents}
          timeLimitSeconds={timeLimitSeconds}
          onPromptChange={setPrompt}
          onSetPromptEditing={setIsEditingPrompt}
          onToggleAgent={toggleAgent}
          onTimeLimitChange={setTimeLimitSeconds}
        />
      );
    }

    if (activeView === 2) {
      const paneList = currentMatch?.agents.length
        ? currentMatch.agents.map((agent) => livePanes[agent.id]).filter((pane): pane is LiveAgentPaneModel => Boolean(pane))
        : Object.values(livePanes);

      const focusedPane = paneList[postMatchAgentIndex] ?? paneList[0];

      return (
        <SplitPane
          panes={paneList}
          focusedPaneId={focusedPane?.id}
          prompt={currentMatch?.prompt ?? prompt}
          elapsedSeconds={elapsedSeconds}
        />
      );
    }

    if (activeView === 3) {
      if (!currentMatch) {
        return (
          <Box paddingX={1}>
            <Text dimColor>No completed match yet.</Text>
          </Box>
        );
      }

      return (
        <PostMatch
          match={currentMatch}
          selectedIndex={postMatchAgentIndex}
          agents={currentMatch.agents.map((agent) => ({
            entry: agent,
            stats: currentMatch.stats.agentStats.find((item) => item.agentId === agent.id)
          }))}
        />
      );
    }

    if (activeView === 4) {
      return <MatchThread thread={thread} />;
    }

    if (activeView === 5) {
      return <Leaderboard rows={leaderboardRows} sortBy={leaderboardSort} />;
    }

    if (activeView === 6) {
      return <MatchHistory matches={historyRows} />;
    }

    const profile = selectedProfileProvider && dbRef.current ? getAgentProfile(dbRef.current, selectedProfileProvider) : null;
    return <AgentProfile profile={profile} />;
  }

  const runningAgents = Object.values(livePanes).filter((pane) => pane.status === "running").length;
  const displayRunningAgents = statusMode === "racing" ? runningAgents : currentMatch?.agents.length ?? selectedAgentProviders.length;

  return (
    <Box flexDirection="column">
      <Box paddingX={1} flexDirection="column">
        <Text bold>gg</Text>
        <Text dimColor>
          Good game. Every time. | repo: {repoName} | base: {baseBranch} | view {activeView}: {viewLabel(activeView)}
        </Text>
        <Text dimColor>[1]Setup [2]Live [3]Stats [4]Thread [5]Leaderboard [6]History [7]Profile [?]Help [q]Quit</Text>
        <Text dimColor>
          Default time limit:{" "}
          {config.gg.default_time_limit > 0
            ? `${Math.floor(config.gg.default_time_limit / 60)} min`
            : "none (unlimited)"}{" "}
          | Selected agents: {selectedAgentProviders.length}
        </Text>
        {h2hSummary ? <Text dimColor>{h2hSummary}</Text> : null}
        {warnings.map((warning, index) => (
          <Text key={`warning-${index}`} color="yellow">
            Warning: {warning}
          </Text>
        ))}
      </Box>

      {renderView()}

      {activeView === 3 && diffPreview.length > 0 ? (
        <Box marginTop={1}>
          <BranchPreview title="Diff Preview" content={diffPreview} />
        </Box>
      ) : null}

      {notice ? (
        <Box paddingX={1}>
          <Text color="yellow">{notice}</Text>
        </Box>
      ) : null}

      {showHelp ? (
        <Box paddingX={1} marginTop={1}>
          <HelpOverlay />
        </Box>
      ) : null}

      <StatusBar
        mode={statusMode}
        repoName={repoName}
        runningAgents={displayRunningAgents}
        elapsedSeconds={elapsedSeconds}
        spentUSD={0}
        winner={currentMatch?.winnerId}
        baseBranch={baseBranch}
      />
    </Box>
  );
}
