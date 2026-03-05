import { matchesAnyPattern } from "./patterns.js";

export interface GuardRules {
  allow: string[];
  deny: string[];
}

export type GuardViolationReason = "deny_rule" | "outside_allowlist";

export interface GuardCheckResult {
  allowed: boolean;
  reason?: GuardViolationReason;
}

interface RawGuardConfig {
  allow?: string[];
  deny?: string[];
}

export function normalizeGuardRules(rawGuard?: RawGuardConfig): GuardRules {
  return {
    allow: rawGuard?.allow ?? [],
    deny: rawGuard?.deny ?? []
  };
}

export function evaluateGuard(filePath: string, rules: GuardRules): GuardCheckResult {
  if (matchesAnyPattern(filePath, rules.deny)) {
    return { allowed: false, reason: "deny_rule" };
  }

  if (rules.allow.length === 0) {
    return { allowed: true };
  }

  if (!matchesAnyPattern(filePath, rules.allow)) {
    return { allowed: false, reason: "outside_allowlist" };
  }

  return { allowed: true };
}

export function isPathAllowed(filePath: string, rules: GuardRules): boolean {
  return evaluateGuard(filePath, rules).allowed;
}
