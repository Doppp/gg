import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { listLocalBranches, listWorktrees } from "../lib/git.js";
import { simpleGit } from "simple-git";

export interface RecoveryScanOptions {
  repoPath: string;
  worktreeDir?: string;
  dbPath?: string;
}

export interface RecoveryScanResult {
  danglingBranches: string[];
  orphanedWorktrees: string[];
  unfinishedMatches: UnfinishedMatchRecord[];
}

export interface UnfinishedMatchRecord {
  id: string;
  sourceBranch: string | null;
  baseBranch: string | null;
  baseBranchMode: string | null;
}

function resolveWorktreeRoot(repoPath: string, worktreeDir: string): string {
  return path.resolve(repoPath, worktreeDir);
}

function listWorktreeDirs(worktreeRoot: string): string[] {
  if (!fs.existsSync(worktreeRoot)) {
    return [];
  }

  return fs
    .readdirSync(worktreeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(worktreeRoot, entry.name));
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function loadUnfinishedMatches(dbPath?: string): UnfinishedMatchRecord[] {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return [];
  }

  let db: Database.Database | undefined;

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const selectColumns = [
      "id",
      hasColumn(db, "matches", "source_branch") ? "source_branch as sourceBranch" : "NULL as sourceBranch",
      hasColumn(db, "matches", "base_branch") ? "base_branch as baseBranch" : "NULL as baseBranch",
      hasColumn(db, "matches", "base_branch_mode") ? "base_branch_mode as baseBranchMode" : "NULL as baseBranchMode"
    ];
    const rows = db
      .prepare(
        `SELECT ${selectColumns.join(", ")}
         FROM matches
         WHERE status NOT IN ('merged', 'cancelled')
         ORDER BY started_at DESC`
      )
      .all() as UnfinishedMatchRecord[];

    return rows;
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export async function scanRecoveryState(options: RecoveryScanOptions): Promise<RecoveryScanResult> {
  const worktreeDir = options.worktreeDir ?? ".gg-worktrees";
  const worktreeRoot = resolveWorktreeRoot(options.repoPath, worktreeDir);

  const [branches, registeredWorktrees] = await Promise.all([
    listLocalBranches(options.repoPath),
    listWorktrees(options.repoPath)
  ]);

  const danglingBranches = branches.filter((branch) => branch.startsWith("gg/"));

  const registeredSet = new Set(registeredWorktrees.map((worktree) => path.resolve(worktree)));
  const orphanedWorktrees = listWorktreeDirs(worktreeRoot)
    .filter((dir) => path.basename(dir) !== "preview")
    .filter((dir) => !registeredSet.has(path.resolve(dir)));

  const unfinishedMatches = loadUnfinishedMatches(options.dbPath);

  return {
    danglingBranches,
    orphanedWorktrees,
    unfinishedMatches
  };
}

export interface RecoveryCleanOptions {
  repoPath: string;
  branches?: string[];
  worktrees?: string[];
}

export async function cleanRecoveryState(options: RecoveryCleanOptions): Promise<void> {
  const git = simpleGit(options.repoPath);

  for (const worktree of options.worktrees ?? []) {
    await git.raw(["worktree", "remove", "--force", worktree]).catch(() => undefined);
  }

  for (const branch of options.branches ?? []) {
    await git.deleteLocalBranch(branch, true).catch(() => undefined);
  }

  for (const worktree of options.worktrees ?? []) {
    fs.rmSync(worktree, { recursive: true, force: true });
  }
}
