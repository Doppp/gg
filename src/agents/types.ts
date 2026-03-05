import type { AgentEntry } from "../match/types.js";

export interface DetectedAgent {
  provider: string;
  command: string;
  version: string;
}

export interface AgentExecutionOptions {
  prompt: string;
  worktreePath: string;
  logPath: string;
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeLimitSeconds?: number;
}

export interface AgentProcessHandle {
  pid?: number;
  kill: (signal?: NodeJS.Signals | number) => void;
}

export interface AgentSpawnHandlers {
  onStart?: (pid: number | undefined) => void;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError?: (error: Error) => void;
}

export interface AgentExecutor {
  provider: string;
  spawn: (
    entry: AgentEntry,
    options: AgentExecutionOptions,
    handlers: AgentSpawnHandlers
  ) => Promise<AgentProcessHandle>;
}
