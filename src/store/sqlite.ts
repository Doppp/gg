import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";

export function defaultDatabasePath(): string {
  return path.join(os.homedir(), ".local", "share", "gg", "gg.db");
}

export function openDatabase(dbPath = defaultDatabasePath()): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  runMigrations(db);
  return db;
}
