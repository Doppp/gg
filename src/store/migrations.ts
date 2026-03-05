import type Database from "better-sqlite3";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS matches (
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

CREATE TABLE IF NOT EXISTS match_agents (
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

    risk_flags      TEXT,
    checks_results  TEXT,

    log_path        TEXT,
    thread_path     TEXT
);

CREATE TABLE IF NOT EXISTS agent_profiles (
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
    head_to_head    TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_repo ON matches(repo);
CREATE INDEX IF NOT EXISTS idx_match_agents_match ON match_agents(match_id);
CREATE INDEX IF NOT EXISTS idx_match_agents_provider ON match_agents(provider);
`;

export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
