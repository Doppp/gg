import { setTimeout as delay } from "node:timers/promises";
import type { AgentExecutor } from "./types.js";

export const mockExecutor: AgentExecutor = {
  provider: "mock",
  async spawn(_entry, _options, handlers) {
    let killed = false;
    const pid = Math.floor(Math.random() * 10000) + 1000;

    handlers.onStart?.(pid);

    void (async () => {
      await delay(120);
      if (killed) return;
      handlers.onStdout?.("[mock] starting task\n");
      await delay(180);
      if (killed) return;
      handlers.onStdout?.("[mock] writing files\n");
      await delay(180);
      if (killed) return;
      handlers.onStdout?.("[mock] finished\n");
      handlers.onExit?.(0, null);
    })();

    return {
      pid,
      kill: () => {
        killed = true;
        handlers.onExit?.(130, "SIGINT");
      }
    };
  }
};
