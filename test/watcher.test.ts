import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeGuardRules } from "../src/safety/guard.js";
import { createSafetyWatcher, type SafetyViolation } from "../src/safety/watcher.js";
import { createTempDir } from "./helpers/git.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function waitForViolation(violations: SafetyViolation[], timeoutMs = 2500): Promise<SafetyViolation | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (violations.length > 0) {
      return violations[0];
    }
    await delay(50);
  }
  return undefined;
}

describe("safety watcher", () => {
  it("flags guard violations on denied writes", async () => {
    const root = createTempDir("gg-phase2-watch-");
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, "src", "auth"), { recursive: true });

    const violations: SafetyViolation[] = [];
    const watcher = createSafetyWatcher(root, {
      guardRules: normalizeGuardRules({ allow: ["src/components/*"], deny: ["src/auth/*"] }),
      onViolation: (violation) => {
        violations.push(violation);
      }
    });

    fs.writeFileSync(path.join(root, "src", "auth", "middleware.ts"), "export const x = 1;\n", "utf8");

    const firstViolation = await waitForViolation(violations);

    watcher.close();

    expect(firstViolation).toBeDefined();
    expect(firstViolation?.type).toBe("guard_violation");
    expect(firstViolation?.path).toBe("src/auth/middleware.ts");
  });
});
