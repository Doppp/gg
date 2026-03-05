import { describe, expect, it } from "vitest";
import { evaluateGuard, normalizeGuardRules } from "../src/safety/guard.js";

describe("guard rules", () => {
  it("enforces deny first and allowlist constraints", () => {
    const rules = normalizeGuardRules({
      allow: ["src/components/*", "src/hooks/*"],
      deny: ["src/auth/*", ".env*", "*.key"]
    });

    expect(evaluateGuard("src/components/button.ts", rules)).toEqual({ allowed: true });
    expect(evaluateGuard("src/auth/middleware.ts", rules)).toEqual({ allowed: false, reason: "deny_rule" });
    expect(evaluateGuard("README.md", rules)).toEqual({ allowed: false, reason: "outside_allowlist" });
  });
});
