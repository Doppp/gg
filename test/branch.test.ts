import { describe, expect, it } from "vitest";
import { buildMatchBranchName } from "../src/match/branch.js";

describe("buildMatchBranchName", () => {
  it("builds namespaced branch names", () => {
    expect(
      buildMatchBranchName({
        matchId: "match_20260305_1530",
        provider: "codex",
        slug: "dark-mode-toggle"
      })
    ).toBe("gg/match_20260305_1530/codex/dark-mode-toggle");
  });
});
