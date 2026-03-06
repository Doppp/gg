import fs from "node:fs";
import path from "node:path";
import type { MatchThread, PromptStrategy, ThreadEvent } from "./types.js";

export class ThreadRecorder {
  private readonly thread: MatchThread;

  constructor(
    matchId: string,
    agentId: string,
    provider: string,
    prompt: string,
    effectivePrompt: string,
    promptStrategy: PromptStrategy
  ) {
    this.thread = {
      matchId,
      agentId,
      provider,
      prompt,
      effectivePrompt,
      promptStrategy,
      events: []
    };

    this.push({ type: "prompt", timestamp: new Date().toISOString(), content: prompt });
    if (effectivePrompt !== prompt) {
      this.push({
        type: "effective_prompt",
        timestamp: new Date().toISOString(),
        content: effectivePrompt,
        strategy: promptStrategy
      });
    }
  }

  push(event: ThreadEvent): void {
    this.thread.events.push(event);
  }

  toJSON(): MatchThread {
    return {
      ...this.thread,
      events: [...this.thread.events]
    };
  }

  writeToFile(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(this.thread, null, 2)}\n`, "utf8");
  }
}

export function readThreadFromFile(filePath: string): MatchThread | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as MatchThread;
  } catch {
    return null;
  }
}
