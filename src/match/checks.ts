import fs from "node:fs";
import path from "node:path";
import { execaCommand } from "execa";
import type { CheckResult } from "./types.js";

export interface RunChecksOptions {
  cwd: string;
  checks: string[];
  outputDir?: string;
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function runChecks(options: RunChecksOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of options.checks) {
    const result = await execaCommand(check, {
      cwd: options.cwd,
      reject: false,
      all: true,
      env: {
        ...process.env,
        CI: "1"
      }
    });

    let outputPath: string | undefined;
    if (options.outputDir) {
      fs.mkdirSync(options.outputDir, { recursive: true });
      outputPath = path.join(options.outputDir, `${sanitizeName(check)}.log`);
      fs.writeFileSync(
        outputPath,
        [`$ ${check}`, "", result.all ?? "", "", `exit=${result.exitCode}`].join("\n"),
        "utf8"
      );
    }

    results.push({
      name: check,
      passed: result.exitCode === 0,
      outputPath
    });
  }

  return results;
}
