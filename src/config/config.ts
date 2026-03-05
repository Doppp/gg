import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import TOML from "@iarna/toml";
import { DEFAULT_CONFIG, type GGConfig } from "./defaults.js";

export interface RepoConfig {
  checks?: string[];
  review?: {
    test?: string;
    build?: string;
    serve?: string;
    run?: string;
    url?: string;
  };
  guard?: {
    allow?: string[];
    deny?: string[];
  };
}

const ENV_PATTERN = /\$([A-Z_][A-Z0-9_]*)/g;

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) {
    return base;
  }
  if (Array.isArray(base) && Array.isArray(override)) {
    return override as unknown as T;
  }
  if (typeof base !== "object" || base === null || typeof override !== "object" || override === null) {
    return override as T;
  }

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    result[key] = key in result ? deepMerge(result[key] as never, value) : value;
  }
  return result as T;
}

function expandEnv(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_PATTERN, (_match, name: string) => process.env[name] ?? "");
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandEnv(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = expandEnv(nested);
    }
    return out;
  }
  return value;
}

function loadTomlFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return TOML.parse(raw) as Record<string, unknown>;
}

export function getConfigPaths(repoPath: string): string[] {
  return [
    path.join(os.homedir(), ".config", "gg", "gg.toml"),
    path.join(repoPath, "gg.toml")
  ];
}

export function loadConfig(repoPath: string): GGConfig {
  const merged = getConfigPaths(repoPath)
    .map((filePath) => loadTomlFile(filePath))
    .filter((value): value is Record<string, unknown> => value !== null)
    .reduce((acc, current) => deepMerge(acc, current), DEFAULT_CONFIG as unknown as Record<string, unknown>);

  return expandEnv(merged) as GGConfig;
}

export function loadRepoConfig(repoPath: string): RepoConfig {
  const repoConfigPath = path.join(repoPath, "gg.config.json");
  if (!fs.existsSync(repoConfigPath)) {
    return {};
  }
  const raw = fs.readFileSync(repoConfigPath, "utf8");
  return JSON.parse(raw) as RepoConfig;
}
