import type { AgentExecutor } from "./types.js";

export const copilotExecutor: AgentExecutor = {
  provider: "copilot",
  async spawn(_entry, _options, handlers) {
    handlers.onError?.(new Error("Copilot executor not implemented in MVP."));
    return {
      pid: undefined,
      kill: () => undefined
    };
  }
};
