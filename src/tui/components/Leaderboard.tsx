import React from "react";
import { Box, Text } from "ink";
import type { LeaderboardRow } from "../../store/queries.js";

interface LeaderboardProps {
  rows: LeaderboardRow[];
  sortBy: "winRate" | "matches" | "cost";
}

function sortRows(rows: LeaderboardRow[], sortBy: LeaderboardProps["sortBy"]): LeaderboardRow[] {
  const copy = [...rows];
  if (sortBy === "matches") {
    copy.sort((a, b) => b.matches - a.matches);
    return copy;
  }
  if (sortBy === "cost") {
    copy.sort((a, b) => a.avgCostPerMatch - b.avgCostPerMatch);
    return copy;
  }

  copy.sort((a, b) => b.winRate - a.winRate || b.matches - a.matches);
  return copy;
}

export function Leaderboard({ rows, sortBy }: LeaderboardProps): React.JSX.Element {
  const sorted = sortRows(rows, sortBy);

  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold>Leaderboard</Text>
      <Text dimColor>[s] sort column | [/] filter (planned)</Text>
      <Text>provider           matches  wins  win%   avg-time  avg-cost</Text>
      {sorted.length === 0 ? <Text dimColor>(no matches yet)</Text> : null}
      {sorted.map((row) => (
        <Text key={row.provider}>
          {row.provider.padEnd(18, " ")}
          {String(row.matches).padStart(7, " ")}
          {String(row.wins).padStart(6, " ")}
          {`${(row.winRate * 100).toFixed(1)}%`.padStart(7, " ")}
          {`${row.avgTimeToCompletion.toFixed(1)}s`.padStart(10, " ")}
          {`$${row.avgCostPerMatch.toFixed(2)}`.padStart(10, " ")}
        </Text>
      ))}
    </Box>
  );
}
