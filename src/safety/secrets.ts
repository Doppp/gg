import fs from "node:fs";
import path from "node:path";
import { matchesAnyPattern } from "./patterns.js";

export const DEFAULT_BLOCKED_SECRET_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "id_rsa",
  "id_ed25519",
  ".aws/*",
  ".gcloud/*",
  ".azure/*"
] as const;

function walkFiles(rootPath: string, current = ""): string[] {
  const absolute = path.join(rootPath, current);
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const relative = path.join(current, entry.name).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      out.push(...walkFiles(rootPath, relative));
    } else {
      out.push(relative);
    }
  }

  return out;
}

export interface SecretScanResult {
  blockedPatterns: readonly string[];
  matchingFiles: string[];
}

export function scanForSecretFiles(
  repoPath: string,
  blockedPatterns: readonly string[] = DEFAULT_BLOCKED_SECRET_PATTERNS
): SecretScanResult {
  const files = walkFiles(repoPath);
  const matchingFiles = files.filter((filePath) => matchesAnyPattern(filePath, blockedPatterns));

  return {
    blockedPatterns,
    matchingFiles
  };
}

export function isSecretPath(filePath: string, blockedPatterns: readonly string[] = DEFAULT_BLOCKED_SECRET_PATTERNS): boolean {
  return matchesAnyPattern(filePath, blockedPatterns);
}
