import { execa } from "execa";
import type { GGConfig } from "../config/defaults.js";
import type { DetectedAgent } from "./types.js";

interface CandidateAgent {
  provider: "claude" | "codex";
  command: string;
}

const CANDIDATES: CandidateAgent[] = [
  { provider: "claude", command: "claude" },
  { provider: "codex", command: "codex" }
];

function parseVersion(stdout: string, stderr: string): string {
  const line = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line ?? "unknown";
}

async function detectOne(provider: CandidateAgent["provider"], command: string): Promise<DetectedAgent | null> {
  try {
    const result = await execa(command, ["--version"], {
      reject: false,
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (result.exitCode !== 0 && !result.stdout && !result.stderr) {
      return null;
    }

    return {
      provider,
      command,
      version: parseVersion(result.stdout, result.stderr)
    };
  } catch {
    return null;
  }
}

export async function detectInstalledAgents(config: GGConfig): Promise<DetectedAgent[]> {
  const detected: DetectedAgent[] = [];

  for (const candidate of CANDIDATES) {
    const providerConfig = config.agents[candidate.provider];
    if (providerConfig?.enabled === false) {
      continue;
    }

    const command = providerConfig?.command ?? candidate.command;
    const agent = await detectOne(candidate.provider, command);
    if (agent) {
      detected.push(agent);
    }
  }

  return detected;
}
