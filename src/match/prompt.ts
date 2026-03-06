import type { PromptStrategy } from "./types.js";

const COMPETITION_PREAMBLE = [
  "You are in a blind head-to-head coding match against another model on the same task.",
  "",
  "You will be judged on:",
  "- correctness",
  "- passing project checks/tests",
  "- minimal, focused changes",
  "- low-risk edits",
  "- working result when manually reviewed",
  "",
  "Do not over-engineer. Do not add unnecessary features. Prefer the simplest correct implementation that is likely to pass checks and hold up under manual testing."
].join("\n");

export function buildEffectivePrompt(prompt: string, strategy: PromptStrategy): string {
  if (strategy === "plain") {
    return prompt;
  }

  return `${COMPETITION_PREAMBLE}\n\nTask:\n${prompt}`;
}
