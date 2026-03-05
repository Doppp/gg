import React from "react";
import { Box, Text } from "ink";
import { modeColor } from "../theme.js";

export type StatusMode = "setup" | "branching" | "racing" | "reviewing" | "merged";

interface StatusBarProps {
  mode: StatusMode;
  repoName: string;
  runningAgents: number;
  elapsedSeconds: number;
  spentUSD: number;
  winner?: string;
  baseBranch?: string;
}

function renderStatusContent(props: StatusBarProps): string {
  if (props.mode === "setup") {
    return `Write prompt + select agents | repo: ${props.repoName}`;
  }
  if (props.mode === "branching") {
    return `Creating worktrees... ${props.runningAgents} agents`;
  }
  if (props.mode === "racing") {
    return `${props.runningAgents} agents running | ${props.elapsedSeconds}s | $${props.spentUSD.toFixed(2)} spent`;
  }
  if (props.mode === "reviewing") {
    return `Match complete | ${props.runningAgents} branches to review | [w] pick winner`;
  }
  return `${props.winner ?? "winner"} wins! Merged into ${props.baseBranch ?? "base"} | cleaned`;
}

export function StatusBar(props: StatusBarProps): React.JSX.Element {
  const color = modeColor(props.mode);

  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} marginTop={1}>
      <Text color={color}>[{props.mode}] </Text>
      <Text>{renderStatusContent(props)}</Text>
    </Box>
  );
}
