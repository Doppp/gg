# gg — SPEC.md (v1.1, agent-implementable)

> Slopen Source Collective · MIT License · AI-Generated · Experimental Software  
> Repo: `github.com/slopensource/gg`  
> Tagline: **Good game. Every time.**

This SPEC is **implementation-grade**: it includes the **exact TypeScript data structures**, **TUI screens + keybindings**, **post-match stat sheet ASCII layout**, **match thread event schema**, **SQLite schema**, **preview worktree behavior**, **crash recovery**, and a **phased build plan with testing gates**.

---

## 1. Overview

`gg` is a TUI that spins up multiple AI coding agents on separate git branches (in separate worktrees), gives them the same prompt, and lets them race to build the best solution in your actual codebase. You watch them work in real time, preview results, pick the winner, and merge the winning branch. Post-match stats show how each agent performed.

Core flow:

1. User opens `gg` in a git repo
2. User writes a prompt
3. User picks 2+ agents to compete
4. `gg` creates a feature branch + worktree per agent, spawns each agent with the prompt
5. User watches live output in split-pane
6. Agents finish (or time out) → post-match stat sheet
7. User previews changes (diff + preview worktree)
8. User picks winner
9. `gg` merges winner, cleans up losers
10. `gg` persists metadata + logs + match threads

---

## 2. Opinionated Tech Stack

- Language: **TypeScript**
- Runtime: **Node.js 20+**
- TUI: **Ink 5 + React 18**
- Dev runner: **tsx**
- Build: **tsc → dist/**
- Config: **TOML** via `@iarna/toml`
- Local storage: **better-sqlite3** (metadata only; logs on disk)
- Git: **simple-git** (plus raw git commands where needed)
- Subprocess: **execa** (streaming stdout/stderr)
- Testing: **vitest**
- Package manager: **npm**
- License: **MIT**

---

## 3. Project Structure

```
gg/
  src/
    cli.ts                            # CLI entrypoint (gg)
    tui/
      cli.ts                          # TUI entrypoint (gg-tui)
      index.tsx                       # Root Ink app, tab routing
      components/
        MatchSetup.tsx                # Prompt input + agent selection
        SplitPane.tsx                 # Side-by-side agent output view
        AgentPane.tsx                 # Single agent live output stream
        PostMatch.tsx                 # Post-match stat sheet
        BranchPreview.tsx             # Diff viewer / branch switcher
        Leaderboard.tsx               # Agent rankings
        MatchHistory.tsx              # Past matches browser
        AgentProfile.tsx              # Single agent career stats
        MatchThread.tsx               # Session log viewer (Ampcode-style)
        StatusBar.tsx                 # Persistent summary bar
        HelpOverlay.tsx               # Keybinding help modal
    match/
      types.ts                        # Match, stats, thread types
      engine.ts                       # Match orchestrator
      timer.ts                        # Match timer + timeout handling
      stats.ts                        # Post-match stat calculation
      thread.ts                       # Match thread recorder
      branch.ts                       # Git branch + worktree management
      checks.ts                       # Quality check runner
    agents/
      types.ts                        # AgentExecutor interface + detection types
      claude.ts                       # Claude Code executor
      codex.ts                        # Codex executor
      copilot.ts                      # Copilot executor (optional)
      devin.ts                        # Devin executor (optional)
      mock.ts                         # Mock agent for dev/testing
      detector.ts                     # Detect installed agent CLIs
    safety/
      secrets.ts                      # Secret scanner
      guard.ts                        # Guarded mode path enforcement
      watcher.ts                      # FS watcher for violations
    preview/
      diff.ts                         # Git diff between branches
      worktree.ts                     # Preview worktree management
    leaderboard/
      types.ts                        # MatchRecord JSON schema
      exporter.ts                     # Export match record to JSON
      uploader.ts                     # Optional upload
      privacy.ts                      # Privacy mode enforcement
    store/
      sqlite.ts                       # SQLite persistence
      migrations.ts                   # Schema migrations
      queries.ts                      # Aggregation queries
    config/
      config.ts                       # TOML config loader
      defaults.ts                     # Default config values
    lib/
      format.ts                       # Formatting helpers
      cost.ts                         # Cost utilities
      git.ts                          # Git helpers
    recovery/
      recovery.ts                     # Crash recovery
  test/
  gg.toml                             # Example user config
  gg.config.json                       # Example repo config
  package.json
  tsconfig.json
```

---

## 4. Configuration

### 4.1 User config: `gg.toml`
Lives at `~/.config/gg/gg.toml` or `./gg.toml`.

Key responsibilities:
- enable/disable agents
- agent keys and CLI invocation
- budgets
- safety toggles
- leaderboard settings

Example:

```toml
[gg]
theme = "dark"
default_time_limit = 600
worktree_dir = ".gg-worktrees"

[agents.claude]
enabled = true
api_key = "$ANTHROPIC_API_KEY"
command = "claude"
args = ["--dangerously-skip-permissions"]

[agents.codex]
enabled = true
api_key = "$OPENAI_API_KEY"
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
endpoint = "https://gg.sh/api/match"
default_privacy = "private"
```

### 4.2 Repo config: `gg.config.json`
Lives at repo root, committed. Defines checks and guard rules.

```json
{
  "checks": [
    "npm test",
    "npm run lint",
    "npm run typecheck"
  ],
  "guard": {
    "allow": ["src/components/*", "src/styles/*", "src/hooks/*"],
    "deny": ["src/auth/*", ".env*", "*.key"]
  }
}
```

---

## 5. Git Architecture

### 5.1 Branch namespacing

Branches are scoped to match ID:

```
gg/<matchId>/<provider>/<slug>
```

Example:

```
gg/match_20260305_1530/claude/dark-mode-toggle
gg/match_20260305_1530/codex/dark-mode-toggle
```

### 5.2 Worktrees

Worktrees live under `.gg-worktrees/` adjacent to the repo root.

```
repo/
  .git/
  src/
  ...
  .gg-worktrees/
    match-20260305-1530-claude/
    match-20260305-1530-codex/
    preview/
```

### 5.3 Preview worktree (must not mutate main working directory)

`gg` maintains a dedicated preview worktree at:

```
.gg-worktrees/preview/
```

**Behavior**
- The main repo directory remains on `baseBranch` at all times.
- Pressing `b` (post-match) sets the preview worktree HEAD to the selected agent branch.
- User can open `.gg-worktrees/preview/` in an editor or run dev servers from it.

Implementation:
- Use `git worktree add` to create preview if missing.
- Use `git -C .gg-worktrees/preview checkout <branch>` to switch.
- Ensure preview worktree is reusable across matches.

---

## 6. Safety Model

### 6.1 Secret file protection

Default blocked patterns:

```
.env
.env.*
*.pem
*.key
*.p12
id_rsa
id_ed25519
.aws/*
.gcloud/*
.azure/*
```

**MVP note (truthful claim):**
- We can reliably detect **writes** to blocked files via watcher.
- We cannot reliably prevent/detect **reads** without sandboxing.
- Therefore, in MVP:
  - warn loudly if blocked files exist
  - block/flag attempts to modify blocked files
  - provide `allow_secrets=true` override for power users

### 6.2 Guarded mode

From `gg.config.json`:
- allow patterns define writable paths
- deny patterns always block
- violations create `riskFlags` entries and thread events

### 6.3 Worktree isolation
Agents never operate in the user's primary working directory.

---

## 7. Data Structures (TypeScript)

These types are canonical. Implementers must not drift.

### 7.1 Match

```ts
export interface Match {
  id: string;                    // e.g. "match_20260305_1530"
  prompt: string;
  repo: string;                  // Absolute path to the git repo
  baseBranch: string;            // Branch match started from
  agents: AgentEntry[];
  status: MatchStatus;
  startedAt: Date;
  endedAt?: Date;
  winnerId?: string;
  mergedBranch?: string;
  stats: MatchStats;
  checks?: CheckResults;         // Quality check results per agent
  privacy: "public" | "private" | "anonymous";
  logDir: string;                // disk directory for match artifacts
}

export type MatchStatus =
  | "setup"
  | "branching"
  | "running"
  | "reviewing"
  | "decided"
  | "merged"
  | "cancelled";
```

### 7.2 AgentEntry

```ts
export interface AgentEntry {
  id: string;                    // e.g. "claude-1"
  provider: string;              // "claude" | "codex" | "copilot" | "devin" | ...
  model?: string;
  branch: string;                // e.g. "gg/match_.../claude/dark-mode"
  worktreePath: string;          // Absolute path to agent worktree
  status: AgentMatchStatus;
  pid?: number;
  startedAt?: Date;
  completedAt?: Date;
  tokensUsed: number;
  costUSD: number;
  logPath: string;               // raw stdout/stderr file path
  threadPath: string;            // structured thread json path
  riskFlags: string[];
}

export type AgentMatchStatus =
  | "waiting"
  | "spawning"
  | "running"
  | "completed"
  | "failed"
  | "timeout";
```

### 7.3 Post-match stats

```ts
export interface MatchStats {
  matchId: string;
  prompt: string;
  duration: number;              // seconds
  agentStats: AgentMatchStats[];
}

export interface AgentMatchStats {
  agentId: string;
  provider: string;
  model?: string;
  branch: string;

  outcome?: "winner" | "loser" | "dnf";

  // Speed
  timeToFirstOutput: number;
  timeToCompletion: number;
  timeRemaining: number;

  // Git changes
  filesChanged: number;
  filesAdded: number;
  filesDeleted: number;
  insertions: number;
  deletions: number;
  netLines: number;
  commits: number;

  // Efficiency
  tokensUsed: number;
  costUSD: number;
  costPerFile: number;
  tokensPerLine: number;

  // Output
  totalOutputChars: number;

  // Safety
  riskFlags: string[];

  // Checks
  checksResults?: {
    name: string;
    passed: boolean;
    outputPath?: string; // optional file path for full check output
  }[];
}
```

### 7.4 Match thread (Ampcode-style)

```ts
export interface MatchThread {
  matchId: string;
  agentId: string;
  provider: string;
  prompt: string;
  events: ThreadEvent[];
}

export type ThreadEvent =
  | { type: "prompt"; timestamp: string; content: string }
  | { type: "agent_started"; timestamp: string; pid: number }
  | { type: "stdout"; timestamp: string; content: string }
  | { type: "stderr"; timestamp: string; content: string }
  | { type: "file_modified"; timestamp: string; path: string; insertions: number; deletions: number }
  | { type: "file_created"; timestamp: string; path: string }
  | { type: "file_deleted"; timestamp: string; path: string }
  | { type: "command_executed"; timestamp: string; command: string }
  | { type: "risk_flag"; timestamp: string; reason: string; path?: string }
  | { type: "check_result"; timestamp: string; name: string; passed: boolean; output?: string }
  | { type: "agent_exited"; timestamp: string; code: number; signal?: string };
```

### 7.5 Agent profile

```ts
export interface AgentProfile {
  provider: string;
  model?: string;
  matches: number;
  wins: number;
  losses: number;
  dnfs: number;
  winRate: number;
  avgTimeToCompletion: number;
  avgFilesChanged: number;
  avgInsertions: number;
  avgTokensUsed: number;
  avgCostPerMatch: number;
  totalTokens: number;
  totalCostUSD: number;
  currentStreak: number;
  bestStreak: number;
  headToHead: Record<string, { wins: number; losses: number }>;
}
```

### 7.6 Match record (leaderboard export)

```ts
export interface MatchRecord {
  matchId: string;
  privacy: "public" | "private" | "anonymous";
  repo: string | null;
  prompt: string | null;
  agents: string[];
  winner: string | null;
  durationSeconds: number;
  agentStats: {
    provider: string;
    model?: string;
    timeToCompletion: number;
    filesChanged: number;
    insertions: number;
    deletions: number;
    tokensUsed: number;
    costUSD: number;
    checksPassed?: boolean;
    riskFlags: string[];
  }[];
  timestamp: string; // ISO 8601
}
```

Privacy modes:

| Mode | Upload Prompt | Upload Repo | Upload Diff |
|---|---|---|---|
| public | yes | repo name only | metadata only |
| private | no | no | no |
| anonymous | yes | hidden | metadata only |

---

## 8. Agent Execution Engine

### 8.1 Detection

On startup, detect installed agent CLIs (MVP: claude + codex).

- `claude --version`
- `codex --version`

Only detected + enabled agents appear in picker.

### 8.2 Spawn configuration

MVP CLIs (examples):

- Claude Code:
  - command: `claude`
  - args: `["--dangerously-skip-permissions", "-p", prompt]`
- Codex:
  - command: `codex`
  - args: `["--prompt", prompt]`

Spawn with:
- `cwd = worktreePath`
- env vars from `gg.toml`

### 8.3 Process management

Requirements:
- stream stdout/stderr to TUI (ring buffer)
- tee raw output to `<provider>.log`
- record thread events for stdout/stderr
- enforce timeout
- kill on user stop

---

## 9. Match Lifecycle (exact)

### 9.1 Setup
1. user runs `gg` in git repo
2. validate repo is clean; if dirty, warn and offer abort
3. run crash recovery check
4. scan for secret files → warn if present
5. record current branch as `baseBranch`
6. prompt editor input
7. agent selection (2+)
8. optional time limit

### 9.2 Branching
1. `matchId = match_<YYYYMMDD>_<HHMM>`
2. create per-agent branches `gg/<matchId>/<provider>/<slug>`
3. create worktrees at `.gg-worktrees/<matchId>-<provider>/`
4. enable guard watcher if configured

### 9.3 Racing
1. spawn all agents simultaneously
2. stream output (ring buffer) + write logs to disk
3. record thread events
4. monitor violations and add risk flags
5. match ends when all exit OR timeout OR user presses `x`

### 9.4 Finishing
1. kill remaining processes
2. compute diff stats per agent vs baseBranch
3. run checks if configured (per worktree)
4. write thread JSON files
5. write match record JSON
6. show post-match stat sheet

### 9.5 Reviewing actions
From stat sheet:
- `d`: show git diff for selected agent vs baseBranch
- `b`: switch preview worktree to selected agent branch (never mutate main dir)
- `v`: view match thread
- arrow keys: switch selected agent

### 9.6 Deciding
- `w`: pick winner
- confirm merge
- merge winner into baseBranch
- delete match branches + worktrees
- update SQLite stats + profiles
- optional upload if enabled

### 9.7 Cleanup on cancel/quit
- kill processes
- delete worktrees and branches for this match
- mark match cancelled

---

## 10. Post-match Stat Sheet (signature UI)

### 10.1 ASCII Layout (must implement)

```
┌─────────────────────────────────────────────────────────┐
│                    MATCH COMPLETE                        │
│       "add dark mode toggle to settings page"            │
├──────────────────┬───────────────────┬──────────────────┤
│   Claude Code     │                   │   OpenAI Codex   │
├──────────────────┼───────────────────┼──────────────────┤
│          1m 48s   │   Time            │   1m 12s         │
│            0m 3s  │   First Output    │   0m 8s          │
│              6    │   Files Changed   │   4              │
│             +84   │   Insertions      │   +41            │
│             -11   │   Deletions       │   -8             │
│              3    │   Commits         │   2              │
│         12,341    │   Tokens Used     │   9,901          │
│          $0.23    │   Cost            │   $0.17          │
│            ✓      │   Tests Passing   │   ✗              │
│            ✓      │   Lint Clean      │   ✓              │
│          none     │   Risk Flags      │   edited auth mw │
├──────────────────┴───────────────────┴──────────────────┤
│ [d] diff [←→] switch agent [b] preview [v] thread        │
│ [w] pick winner [r] rematch [n] new match [?] help       │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Stat definitions (source of truth)

| Stat | Source | Notes |
|---|---|---|
| Time | wall clock spawn→exit | per agent |
| First Output | time until first stdout | per agent |
| Files Changed | `git diff --stat` | per agent |
| Insertions/Deletions | `git diff --numstat` | per agent |
| Commits | commits on agent branch | per agent |
| Tokens Used | from agent telemetry/CLI output | estimate if not available |
| Cost | USD | derived from tokens and pricing config |
| Tests/Lint/Typecheck | from configured checks | optional |
| Risk Flags | safety module | from violations |

---

## 11. Match Threads (must implement)

### 11.1 Storage
Per match directory:

```
~/.local/share/gg/matches/<matchId>/
  claude.log
  claude.thread.json
  codex.log
  codex.thread.json
  match.json
```

### 11.2 Thread viewer rendering
Press `v` in stat sheet to view timeline with timestamps and icons.

Must render at least:
- prompt
- stdout/stderr lines
- file changes (created/modified/deleted)
- commands (if detectable)
- risk flags
- check results
- exit

---

## 12. Quality Checks

Configured in `gg.config.json`:

```json
{ "checks": ["npm test", "npm run lint", "npm run typecheck"] }
```

Implementation:
- after agents finish, run each check in each agent worktree
- record `check_result` thread events
- store full output optionally to file for later inspection
- surface pass/fail in stat sheet

---

## 13. Local Storage

### 13.1 SQLite (metadata only)

DB path: `~/.local/share/gg/gg.db`

Schema (must implement as-is):

```sql
CREATE TABLE matches (
    id              TEXT PRIMARY KEY,
    prompt          TEXT NOT NULL,
    repo            TEXT NOT NULL,
    base_branch     TEXT NOT NULL,
    status          TEXT NOT NULL,
    privacy         TEXT NOT NULL DEFAULT 'private',
    started_at      DATETIME NOT NULL,
    ended_at        DATETIME,
    duration        REAL,
    winner_id       TEXT,
    merged_branch   TEXT,
    log_dir         TEXT NOT NULL
);

CREATE TABLE match_agents (
    id              TEXT PRIMARY KEY,
    match_id        TEXT NOT NULL REFERENCES matches(id),
    provider        TEXT NOT NULL,
    model           TEXT,
    branch          TEXT NOT NULL,
    status          TEXT NOT NULL,
    outcome         TEXT,

    time_to_first   REAL,
    time_to_done    REAL,
    time_remaining  REAL,

    files_changed   INTEGER DEFAULT 0,
    files_added     INTEGER DEFAULT 0,
    files_deleted   INTEGER DEFAULT 0,
    insertions      INTEGER DEFAULT 0,
    deletions       INTEGER DEFAULT 0,
    net_lines       INTEGER DEFAULT 0,
    commits         INTEGER DEFAULT 0,

    tokens_used     INTEGER DEFAULT 0,
    cost_usd        REAL DEFAULT 0.0,

    output_chars    INTEGER DEFAULT 0,

    risk_flags      TEXT, -- JSON array
    checks_results  TEXT, -- JSON array of { name, passed, outputPath? }

    log_path        TEXT,
    thread_path     TEXT
);

CREATE TABLE agent_profiles (
    provider        TEXT PRIMARY KEY,
    model           TEXT,
    matches         INTEGER DEFAULT 0,
    wins            INTEGER DEFAULT 0,
    losses          INTEGER DEFAULT 0,
    dnfs            INTEGER DEFAULT 0,
    win_rate        REAL DEFAULT 0.0,
    avg_time        REAL DEFAULT 0.0,
    avg_files       REAL DEFAULT 0.0,
    avg_insertions  REAL DEFAULT 0.0,
    avg_tokens      REAL DEFAULT 0.0,
    avg_cost        REAL DEFAULT 0.0,
    total_tokens    INTEGER DEFAULT 0,
    total_cost      REAL DEFAULT 0.0,
    current_streak  INTEGER DEFAULT 0,
    best_streak     INTEGER DEFAULT 0,
    head_to_head    TEXT -- JSON map keyed by provider
);

CREATE INDEX idx_matches_repo ON matches(repo);
CREATE INDEX idx_match_agents_match ON match_agents(match_id);
CREATE INDEX idx_match_agents_provider ON match_agents(provider);
```

---

## 14. TUI Views & Keybindings

### 14.1 Views (tabs)

| Key | View | Component |
|---|---|---|
| 1 | Match Setup | `MatchSetup.tsx` |
| 2 | Live Match | `SplitPane.tsx` |
| 3 | Post-Match Stats | `PostMatch.tsx` |
| 4 | Match Thread | `MatchThread.tsx` |
| 5 | Leaderboard | `Leaderboard.tsx` |
| 6 | Match History | `MatchHistory.tsx` |
| 7 | Agent Profile | `AgentProfile.tsx` |

### 14.2 Global keybindings (must implement)

| Key | Action |
|---|---|
| 1-7 | switch views |
| q / Ctrl+C | quit (confirm if match running; kills agents + cleanup) |
| Enter | select / confirm |
| Esc | back / close overlay |
| Space | start match (from setup) |
| x | stop all agents early (live match) |
| d | show git diff (post-match) |
| b | preview branch (post-match; switches preview worktree) |
| v | view match thread (post-match) |
| w | pick winner (post-match; triggers merge) |
| r | rematch |
| n | new match |
| s | sort column (leaderboard) |
| / | search / filter |
| ? | help overlay |

### 14.3 StatusBar states

```
[setup]      Write prompt + select agents | repo: <name>
[branching]  Creating worktrees... <agents>
[racing]     <n> agents running | <elapsed> | <$ spent>
[reviewing]  Match complete | <n> branches to review | [w] pick winner
[merged]     <winner> wins! Merged into <baseBranch> | cleaned
```

---

## 15. Crash Recovery (MVP)

On startup, check for:
- dangling `gg/*` branches (interrupted matches)
- orphaned worktrees in `.gg-worktrees/`
- unfinished matches in SQLite (status not merged/cancelled)

User options:
- Resume match (if agents already finished → go to reviewing/stat sheet)
- Clean match (delete branches/worktrees, mark cancelled)
- Delete artifacts (remove logs/threads from disk)

---

## 16. CLI Subcommands

```
gg                                     # launch TUI in current repo
gg --repo /path/to/repo                # launch TUI in specified repo

gg run "<prompt>" --agents claude codex  # run headlessly
gg stats                                # print agent profiles
gg leaderboard                          # print leaderboard
gg history                              # print recent matches
gg profile claude                       # print provider career stats
gg h2h claude codex                     # print head-to-head
gg thread <matchId> <agent>             # print match thread
gg clean                                # remove leftover gg branches + worktrees

gg config allowSecrets true             # toggle secret protection
gg config leaderboard true              # enable leaderboard upload
```

---

## 17. Build Sequence (phased, with testing gates)

### Phase 1: Skeleton + Match Setup TUI
1. Init project (TS, Ink, React, tsx).
2. Entry points: `src/cli.ts` (`gg`), `src/tui/cli.ts` (`gg-tui`) with bin entries.
3. Root `<App>` with 7 views placeholders + tab routing.
4. `<MatchSetup>`: multiline prompt editor, agent picker, time limit selector.
5. Agent detection (`claude --version`, `codex --version`).
6. TOML config loader + `$ENV_VAR` expansion.
7. Persistent `<StatusBar>`.
8. Global keybindings wiring.

**Testing gate:** App launches; tabs switch; prompt editor works; agent detection works; Ctrl+C exits cleanly.

### Phase 2: Git + Safety
1. Branch creation: `gg/<matchId>/<provider>/<slug>`.
2. Worktree manager: create/remove agent worktrees + preview worktree.
3. Repo validation: git repo + clean working tree.
4. Secrets scan + warning; watcher for blocked writes.
5. Guard rules parse + watcher enforcement.
6. Recovery scan on startup + cleanup options UI.

**Testing gate:** Branch/worktrees created; preview worktree switches branches; guard violations flagged; recovery detects orphaned state.

### Phase 3: Agent spawning + Live match
1. Implement mock runner (for deterministic tests).
2. Implement Claude executor (CLI spawn + streaming).
3. Implement match engine: branching → spawn → monitor → timeout/kill.
4. `<SplitPane>` + `<AgentPane>` ring buffer streaming.
5. Raw logs written to disk.
6. Timer + `x` stop.

**Testing gate:** Two mock agents run in parallel; logs written; UI streams; timeout/stop works; cleanup works on cancel.

### Phase 4: Stats + Checks + Threads + Review
1. Stats from `git diff --stat` + `--numstat`.
2. Checks runner from `gg.config.json` per worktree.
3. `<PostMatch>` tennis-style stat sheet + keys (d/b/v/w/r/n).
4. Thread recorder emits full event schema; viewer renders.
5. Diff view (`d`) + preview switch (`b`).
6. Winner merge + branch/worktree cleanup.

**Testing gate:** stat sheet matches layout; diff/preview/thread works; merge flow works; artifacts cleaned; threads saved.

### Phase 5: SQLite + Profiles + Leaderboard export
1. Implement DB + migrations with schema above.
2. Persist matches + match_agents + agent_profiles aggregates.
3. Leaderboard + profile screens from queries.
4. Export `match.json` with privacy filtering.

**Testing gate:** Data persists across restarts; leaderboard sorts; profiles accurate; match.json correct.

---

## 18. MVP Acceptance Criteria

- `gg` launches in a git repo and shows Match Setup in <2s.
- detects installed agent CLIs automatically.
- validates clean working tree; warns on secrets.
- creates match-scoped branches + worktrees correctly.
- runs 2 agents simultaneously (Claude + mock OR Claude + Codex).
- streams output live in split-pane UI.
- writes raw logs and thread JSON to disk.
- computes diff stats and renders tennis-style stat sheet layout.
- supports `d`, `b`, `v`, `w`, `r`, `n` actions as specified.
- preview worktree never mutates main working dir.
- picking winner merges and cleans up match artifacts.
- crash recovery detects and handles orphaned branches/worktrees on startup.
- persists metadata in SQLite using provided schema.
- match record JSON exported with privacy enforcement.

---

```
// they called it slop. we called it progress.
```
