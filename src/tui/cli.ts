#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import React from "react";
import { render } from "ink";
import { isGitRepository } from "../lib/git.js";
import { App } from "./index.js";

export interface LaunchTuiOptions {
  repoPath?: string;
}

export async function launchTui(options: LaunchTuiOptions = {}): Promise<void> {
  const repoPath = path.resolve(options.repoPath ?? process.cwd());
  const isRepo = await isGitRepository(repoPath);

  if (!isRepo) {
    process.stderr.write(`gg requires a git repository. Not a repo: ${repoPath}\n`);
    process.exitCode = 1;
    return;
  }

  process.chdir(repoPath);
  const app = render(React.createElement(App, { repoPath }));
  await app.waitUntilExit();
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isEntrypoint) {
  void launchTui();
}
