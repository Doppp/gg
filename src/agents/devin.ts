import type { AgentExecutor } from "./types.js";

export const devinExecutor: AgentExecutor = {
  provider: "devin",
  async spawn(_entry, _options, handlers) {
    handlers.onError?.(new Error("Devin executor not implemented in MVP."));
    return {
      pid: undefined,
      kill: () => undefined
    };
  }
};
