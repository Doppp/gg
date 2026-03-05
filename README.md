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
gg run "add dark mode toggle" --agents claude codex
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

## Interactive Review

After a match completes (Post-Match view):

- `t`: open an interactive shell in the focused agent worktree
- `u`: run review test command in focused worktree
- `c`: run review build command in focused worktree
- `s`: run review serve command in focused worktree (Ctrl+C to stop)
- `g`: run review run command in focused worktree

Commands come from `gg.config.json > review` (with `u` falling back to the first `checks` entry if needed).

## Config files

- User config: `~/.config/gg/gg.toml` or local `./gg.toml`
- Repo config: `./gg.config.json`
- `gg.toml` tip: set `gg.default_time_limit = 0` for unlimited matches by default.

Example files are included in this repository.

## License

MIT
