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
  mode?: "native" | "polling";
  pollIntervalMs?: number;
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

function snapshotFiles(rootPath: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  const pending = [rootPath];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizePathForMatch(path.relative(rootPath, absolutePath));

      if (relativePath.length > 0 && shouldIgnorePath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stat = fs.statSync(absolutePath);
        snapshot.set(relativePath, `${stat.mtimeMs}:${stat.size}`);
      } catch {
        // Ignore files that disappear mid-scan.
      }
    }
  }

  return snapshot;
}

function createPollingWatcher(
  rootPath: string,
  onEvent: (eventType: string, relativePath: string) => void,
  pollIntervalMs: number
): { close: () => void } {
  let previous = snapshotFiles(rootPath);
  const timer = setInterval(() => {
    const current = snapshotFiles(rootPath);

    for (const [relativePath, signature] of current.entries()) {
      if (previous.get(relativePath) !== signature) {
        onEvent("change", relativePath);
      }
    }

    previous = current;
  }, pollIntervalMs);

  timer.unref?.();

  return {
    close: () => {
      clearInterval(timer);
    }
  };
}

export function createSafetyWatcher(rootPath: string, options: SafetyWatcherOptions): WatcherHandle {
  const active = { closed: false };
  const emitViolation = createViolationEmitter(rootPath, options);
  const polling = options.mode === "polling";

  if (!polling) {
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

      watcher.on("error", () => {
        if (active.closed) {
          return;
        }
      });

      return {
        close: () => {
          active.closed = true;
          watcher.close();
        }
      };
    } catch {
      // Fall back to polling below.
    }
  }

  const fallback = createPollingWatcher(
    rootPath,
    (eventType, relativePath) => {
      if (active.closed) {
        return;
      }
      emitViolation(eventType, relativePath);
    },
    options.pollIntervalMs ?? 150
  );

  return {
    close: () => {
      active.closed = true;
      fallback.close();
    }
  };
}
