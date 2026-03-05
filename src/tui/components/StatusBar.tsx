import React from "react";
import { Box, Text } from "ink";

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

function renderStatus(props: StatusBarProps): string {
  if (props.mode === "setup") {
    return `[setup]      Write prompt + select agents | repo: ${props.repoName}`;
  }
  if (props.mode === "branching") {
    return `[branching]  Creating worktrees... ${props.runningAgents} agents`;
  }
  if (props.mode === "racing") {
    return `[racing]     ${props.runningAgents} agents running | ${props.elapsedSeconds}s | $${props.spentUSD.toFixed(2)} spent`;
  }
  if (props.mode === "reviewing") {
    return `[reviewing]  Match complete | ${props.runningAgents} branches to review | [w] pick winner`;
  }
  return `[merged]     ${props.winner ?? "winner"} wins! Merged into ${props.baseBranch ?? "base"} | cleaned`;
}

export function StatusBar(props: StatusBarProps): React.JSX.Element {
  return (
    <Box borderStyle="round" paddingX={1} marginTop={1}>
      <Text>{renderStatus(props)}</Text>
    </Box>
  );
}
