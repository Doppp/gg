import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/store/migrations.js";
import { createTempDir } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("store migrations", () => {
  it("adds source and base branch mode columns to existing matches tables", () => {
    const root = createTempDir("gg-migrations-");
    tempDirs.push(root);

    const dbPath = path.join(root, "gg.db");
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE matches (
          id TEXT PRIMARY KEY,
          prompt TEXT NOT NULL,
          repo TEXT NOT NULL,
          base_branch TEXT NOT NULL,
          status TEXT NOT NULL,
          privacy TEXT NOT NULL DEFAULT 'private',
          started_at DATETIME NOT NULL,
          ended_at DATETIME,
          duration REAL,
          winner_id TEXT,
          merged_branch TEXT,
          log_dir TEXT NOT NULL
        );
      `);

      runMigrations(db);

      const columns = db.prepare("PRAGMA table_info(matches)").all() as Array<{ name: string }>;
      expect(columns.some((column) => column.name === "source_branch")).toBe(true);
      expect(columns.some((column) => column.name === "base_branch_mode")).toBe(true);
    } finally {
      db.close();
    }
  });
});
