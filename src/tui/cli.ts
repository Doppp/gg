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

function enterAppScreen(): void {
  if (!process.stdout.isTTY) {
    return;
  }

  // Enter alternate screen buffer and clear it so the app gets a clean canvas.
  process.stdout.write("\u001B[?1049h\u001B[2J\u001B[H");
}

function exitAppScreen(): void {
  if (!process.stdout.isTTY) {
    return;
  }

  // Clear app content and return to primary screen buffer.
  process.stdout.write("\u001B[2J\u001B[H\u001B[?1049l");
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
  enterAppScreen();
  const app = render(React.createElement(App, { repoPath }));

  try {
    await app.waitUntilExit();
  } finally {
    app.clear();
    exitAppScreen();
  }
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isEntrypoint) {
  void launchTui();
}
