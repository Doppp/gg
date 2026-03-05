import { claudeExecutor } from "./claude.js";
import { codexExecutor } from "./codex.js";
import { mockExecutor } from "./mock.js";
import type { AgentExecutor } from "./types.js";

export function createDefaultExecutorRegistry(): Record<string, AgentExecutor> {
  return {
    claude: claudeExecutor,
    codex: codexExecutor,
    mock: mockExecutor
  };
}
