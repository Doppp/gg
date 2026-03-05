import fs from "node:fs";
import path from "node:path";
import type { GuardRules } from "./guard.js";
import { evaluateGuard } from "./guard.js";
import { normalizePathForMatch } from "./patterns.js";
import { isSecretPath } from "./secrets.js";

export type SafetyViolationType = "secret_write" | "guard_violation";

export interface SafetyViolation {
  type: SafetyViolationType;
  path: string;
  reason: string;
}

export interface WatcherHandle {
  close: () => void;
}

export interface SafetyWatcherOptions {
  blockedSecretPatterns?: readonly string[];
  guardRules?: GuardRules;
  onViolation: (violation: SafetyViolation) => void;
}

function shouldIgnorePath(relativePath: string): boolean {
  return relativePath.startsWith(".git/") || relativePath.startsWith("node_modules/");
}

function hasWriteSignal(eventType: string): boolean {
  return eventType === "change" || eventType === "rename";
}

function isFilePath(absolutePath: string): boolean {
  try {
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

function createViolationEmitter(rootPath: string, options: SafetyWatcherOptions) {
  return (eventType: string, rawRelativePath: string): void => {
    if (!hasWriteSignal(eventType)) {
      return;
    }

    const relativePath = normalizePathForMatch(rawRelativePath);
    if (relativePath.length === 0 || shouldIgnorePath(relativePath)) {
      return;
    }

    const absolutePath = path.join(rootPath, relativePath);
    if (!isFilePath(absolutePath)) {
      return;
    }

    if (isSecretPath(relativePath, options.blockedSecretPatterns)) {
      options.onViolation({
        type: "secret_write",
        path: relativePath,
        reason: "Blocked secret file pattern modified"
      });
    }

    if (options.guardRules) {
      const guardResult = evaluateGuard(relativePath, options.guardRules);
      if (!guardResult.allowed) {
        options.onViolation({
          type: "guard_violation",
          path: relativePath,
          reason:
            guardResult.reason === "deny_rule"
              ? "Path matched deny rule"
              : "Path is outside guard allowlist"
        });
      }
    }
  };
}

function createFallbackWatchers(rootPath: string, onEvent: (eventType: string, relativePath: string) => void): fs.FSWatcher[] {
  const watchers: fs.FSWatcher[] = [];
  const visited = new Set<string>();

  const watchDir = (directory: string): void => {
    const resolved = path.resolve(directory);
    if (visited.has(resolved)) {
      return;
    }

    visited.add(resolved);

    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(resolved, (eventType, filename) => {
        if (!filename) {
          return;
        }

        const absolutePath = path.join(resolved, String(filename));
        const relativePath = path.relative(rootPath, absolutePath);
        onEvent(eventType, relativePath);

        if (eventType === "rename" && fs.existsSync(absolutePath)) {
          try {
            if (fs.statSync(absolutePath).isDirectory()) {
              watchDir(absolutePath);
            }
          } catch {
            // Ignore race conditions where the path is removed before stat.
          }
        }
      });
      watchers.push(watcher);
    } catch {
      return;
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      watchDir(path.join(resolved, entry.name));
    }
  };

  watchDir(rootPath);
  return watchers;
}

export function createSafetyWatcher(rootPath: string, options: SafetyWatcherOptions): WatcherHandle {
  const active = { closed: false };
  const emitViolation = createViolationEmitter(rootPath, options);
  const watchers: fs.FSWatcher[] = [];

  try {
    const watcher = fs.watch(
      rootPath,
      {
        recursive: true,
        persistent: true
      },
      (eventType, filename) => {
        if (active.closed || !filename) {
          return;
        }
        emitViolation(eventType, String(filename));
      }
    );
    watchers.push(watcher);
  } catch {
    watchers.push(
      ...createFallbackWatchers(rootPath, (eventType, relativePath) => {
        if (active.closed) {
          return;
        }
        emitViolation(eventType, relativePath);
      })
    );
  }

  return {
    close: () => {
      active.closed = true;
      for (const watcher of watchers) {
        watcher.close();
      }
    }
  };
}
