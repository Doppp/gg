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

## Config files

- User config: `~/.config/gg/gg.toml` or local `./gg.toml`
- Repo config: `./gg.config.json`

Example files are included in this repository.

## License

MIT
