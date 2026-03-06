# gg

Good game. Every time.

`gg` is a terminal UI that runs multiple coding agents against the same prompt in isolated git worktrees, then lets you compare outputs, inspect diffs, and merge a winner.

## Status

Implementation now covers the full phased build from `SPEC.md`:

- Multi-view Ink TUI with setup/live/review/thread/leaderboard/history/profile
- Agent detection, spawning, live streaming output panes, timeout and stop handling
- Match-scoped git branches/worktrees and reusable preview worktree switching
- Post-match stats, per-agent checks, thread JSON, raw logs, and `match.json` export
- Winner merge flow and cleanup of match branches/worktrees
- Secret and guard write-violation monitoring with risk flags
- Crash-recovery scanning for dangling branches/worktrees + unfinished DB matches
- SQLite persistence for matches, agents, and aggregated profiles
- CLI subcommands: `run`, `stats`, `leaderboard`, `history`, `profile`, `h2h`, `thread`, `clean`, `config`

## Quick start

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## CLI

```bash
gg
gg --repo /path/to/repo
gg run "add dark mode toggle" --agents claude codex --base new --theme dark-mode --strategy competition
gg stats
gg leaderboard
gg history
gg profile claude
gg h2h claude codex
gg thread <matchId> <agentId>
gg clean
gg config allowSecrets true
gg config leaderboard true
```

Headless `run` flags:

- `--base current|new`
- `--theme <short-branch-theme>`
- `--strategy plain|competition`
- `--time-limit <seconds>`
- `--privacy public|private|anonymous`

## Interactive Review

After a match completes (Post-Match view):

- `t`: open an interactive shell in the focused agent worktree
- `u`: run review test command in focused worktree
- `c`: run review build command in focused worktree
- `s`: run review serve command in focused worktree (Ctrl+C to stop)
- `g`: run review run command in focused worktree

Commands come from `gg.config.json > review` (with `u` falling back to the first `checks` entry if needed).

## Base Branch Flow

Setup now exposes the branch decision instead of assuming the user prepared it manually:

- `Current`: race directly from the current branch
- `Create new`: create a short `feat/<theme>` branch from the current branch, then fork the agent worktrees from that new base

Notes:

- The branch theme is a short fixed-width field in the setup screen.
- `gg` keeps the main checkout on the original branch while the match is running.
- When you pick a winner, `gg` merges that agent into the chosen base branch.
- Match history and recovery persist both the original source branch and the chosen base-branch mode.

## Prompt Strategy

Setup includes a prompt-strategy control:

- `plain`: send the user's prompt as-is
- `competition`: prepend a judging-focused head-to-head instruction before the user prompt

The original prompt remains the visible match prompt in the UI and stored match metadata. The expanded prompt is what gets sent to executors and is recorded separately in match threads.

## E2E Testing

Automated smoke coverage is now available for the real headless CLI flow:

```bash
npm run test:e2e
```

That scenario spins up:

- a disposable git repo
- fake `claude` and `codex` executables on `PATH`
- a real `gg run` headless match
- real worktrees, checks, logs, threads, and SQLite persistence

If you want to watch the flow outside Vitest:

```bash
npm run demo:e2e
```

Optional:

```bash
GG_KEEP_E2E_TMP=1 npm run demo:e2e
```

That keeps the temporary repo/home directory on disk so you can inspect the generated artifacts afterward.

Interactive TUI smoke coverage is available separately:

```bash
npm run test:e2e:tui
```

That scenario launches the built TUI in a PTY, drives a scripted setup flow, waits for the live match and post-match screens, opens the thread view, and verifies the transcript.

If you want to watch that scripted TUI flow outside Vitest:

```bash
npm run demo:e2e:tui
```

Optional:

```bash
GG_KEEP_E2E_TMP=1 npm run demo:e2e:tui
```

Notes:

- `npm test` excludes the TUI smoke test because PTY transcript checks are slower and more environment-sensitive than the default suite.
- The TUI smoke test is a scripted automation mode intended for end-to-end verification. It is not asserting arbitrary user keystrokes one-by-one.

## Config files

- User config: `~/.config/gg/gg.toml` or local `./gg.toml`
- Repo config: `./gg.config.json`
- `gg.toml` tip: set `gg.default_time_limit = 0` for unlimited matches by default.
- `gg.toml` tip: set `gg.default_prompt_strategy = "competition"` to make competition framing the default.

Example files are included in this repository.

## License

MIT
