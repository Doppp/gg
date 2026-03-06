import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createE2EFixture, removeE2EFixture, type E2EFixture } from "./helpers/e2e.js";
import { runTuiSmoke } from "./helpers/tui.js";

const fixtures: E2EFixture[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const fixture = fixtures.pop();
    if (fixture) {
      removeE2EFixture(fixture);
    }
  }
});

describe("tui e2e", () => {
  it(
    "drives the setup flow and reaches live, post-match, and thread views",
    async () => {
      const fixture = createE2EFixture("gg-tui-e2e-");
      fixtures.push(fixture);

      const result = await runTuiSmoke(fixture);
      expect(result.exitCode).toBe(0);

      const transcript = fs.readFileSync(result.transcriptPath, "utf8");
      expect(transcript).toContain("Match Setup");
      expect(transcript).toContain("Base Branch");
      expect(transcript).toContain("Will race from: feat/search-ui");
      expect(transcript).toContain("MATCH LIVE");
      expect(transcript).toContain("MATCH COMPLETE (UNDECIDED)");
      expect(transcript).toContain("Match Thread:");
    },
    30_000
  );
});
