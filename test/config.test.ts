import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config.js";

const tempDirs: string[] = [];

function createTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gg-config-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("loadConfig", () => {
  it("loads repo config and expands env variables", () => {
    const repoPath = createTempRepo();

    process.env.OPENAI_API_KEY = "sk-test-key";

    fs.writeFileSync(
      path.join(repoPath, "gg.toml"),
      [
        "[gg]",
        "default_time_limit = 900",
        "",
        "[agents.codex]",
        "enabled = true",
        "api_key = \"$OPENAI_API_KEY\"",
        "command = \"codex\"",
        "args = []",
        ""
      ].join("\n"),
      "utf8"
    );

    const config = loadConfig(repoPath);

    expect(config.gg.default_time_limit).toBe(900);
    expect(config.agents.codex.api_key).toBe("sk-test-key");
  });
});
