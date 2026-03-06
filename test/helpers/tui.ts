import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { type E2EFixture } from "./e2e.js";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function cliEntrypointPath(): string {
  return path.join(repoRoot(), "dist", "cli.js");
}

export async function runTuiSmoke(
  fixture: E2EFixture
): Promise<{ stdout: string; stderr: string; exitCode: number; transcriptPath: string }> {
  const transcriptPath = path.join(fixture.rootDir, "tui-transcript.log");
  fs.rmSync(transcriptPath, { force: true });

  const scriptPath = path.join(fixture.rootDir, "tui-run.expect");
  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/expect -f
set timeout 20
set repo [lindex $argv 0]
set home [lindex $argv 1]
set bin [lindex $argv 2]
set cli [lindex $argv 3]
set transcript [lindex $argv 4]
set path_delim [lindex $argv 5]

set env(HOME) $home
set env(PATH) "$bin$path_delim$env(PATH)"
set env(GG_AUTOMATION_MODE) "tui-smoke"
set env(GG_FAKE_AGENT_DELAY_MS) "800"

log_file -noappend $transcript
match_max 200000

spawn node $cli --repo $repo
expect {
  eof { exit 0 }
  timeout {
    puts stderr "TIMEOUT:automation-exit"
    exit 124
  }
}
`,
    "utf8"
  );
  fs.chmodSync(scriptPath, 0o755);

  const result = await execa("/usr/bin/expect", [scriptPath, fixture.repoPath, fixture.homeDir, fixture.binDir, cliEntrypointPath(), transcriptPath, path.delimiter], {
    cwd: repoRoot(),
    reject: false
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
    transcriptPath
  };
}
