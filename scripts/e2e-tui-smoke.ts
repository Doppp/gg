import fs from "node:fs";
import { createE2EFixture, removeE2EFixture } from "../test/helpers/e2e.js";
import { runTuiSmoke } from "../test/helpers/tui.js";

const ANSI_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

async function main(): Promise<void> {
  const fixture = createE2EFixture("gg-tui-demo-");
  const keepFixture = process.env.GG_KEEP_E2E_TMP === "1";

  try {
    console.log("TUI E2E smoke run");
    console.log(`temp repo: ${fixture.repoPath}`);
    console.log(`temp home: ${fixture.homeDir}`);
    console.log("");

    const result = await runTuiSmoke(fixture);
    if (result.exitCode !== 0) {
      process.stderr.write(result.stderr);
      throw new Error(`expect runner failed with exit code ${result.exitCode}`);
    }

    const transcript = stripAnsi(fs.readFileSync(result.transcriptPath, "utf8"));
    const milestones = [
      ["setup screen rendered", "Match Setup"],
      ["base branch section rendered", "Base Branch"],
      ["live match view reached", "MATCH LIVE"],
      ["post-match view reached", "MATCH COMPLETE (UNDECIDED)"],
      ["thread view reached", "Match Thread:"]
    ] as const;

    console.log("Verified milestones:");
    for (const [label, token] of milestones) {
      const verified = transcript.includes(token) ? "yes" : "no";
      console.log(`- ${label}: ${verified}`);
    }

    console.log("");
    console.log(`full transcript: ${result.transcriptPath}`);
    console.log("TUI E2E smoke run completed successfully.");
    if (keepFixture) {
      console.log(`temporary files kept at: ${fixture.rootDir}`);
    }
  } finally {
    if (!keepFixture) {
      removeE2EFixture(fixture);
    }
  }
}

void main().catch((error: Error) => {
  process.stderr.write(`TUI E2E smoke run failed: ${error.message}\n`);
  process.exitCode = 1;
});
