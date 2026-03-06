import { execa } from "execa";
import type { AgentExecutor } from "./types.js";

export const codexExecutor: AgentExecutor = {
  provider: "codex",
  async spawn(entry, options, handlers) {
    const command = options.command ?? "codex";
    const baseArgs = options.args ?? [];
    const args = baseArgs.includes("--prompt") ? baseArgs : [...baseArgs, "--prompt", options.prompt];

    const subprocess = execa(command, args, {
      cwd: entry.worktreePath,
      env: options.env,
      reject: false
    });

    handlers.onStart?.(subprocess.pid);
    subprocess.stdout?.on("data", (chunk: Buffer) => handlers.onStdout?.(chunk.toString("utf8")));
    subprocess.stderr?.on("data", (chunk: Buffer) => handlers.onStderr?.(chunk.toString("utf8")));
    subprocess.on("exit", (code, signal) => handlers.onExit?.(code, signal));
    subprocess.on("error", (error) => handlers.onError?.(error));

    return {
      pid: subprocess.pid,
      kill: (signal) => {
        subprocess.kill(signal);
      }
    };
  }
};
