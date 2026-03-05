import React from "react";
import { Box, Text } from "ink";
import type { AgentEntry, AgentMatchStats, Match } from "../../match/types.js";
import { formatCurrency, formatDuration, truncate } from "../../lib/format.js";

export interface PostMatchAgentModel {
  entry: AgentEntry;
  stats?: AgentMatchStats;
}

interface PostMatchProps {
  match: Match;
  agents: PostMatchAgentModel[];
  selectedIndex: number;
}

function padCell(value: string, width = 16): string {
  if (value.length >= width) {
    return value.slice(0, width);
  }
  return `${" ".repeat(width - value.length)}${value}`;
}

function statValue(stats: AgentMatchStats | undefined, key: string): string {
  if (!stats) {
    return "-";
  }

  switch (key) {
    case "time":
      return formatDuration(Math.round(stats.timeToCompletion));
    case "first":
      return formatDuration(Math.round(stats.timeToFirstOutput));
    case "files":
      return String(stats.filesChanged);
    case "ins":
      return `+${stats.insertions}`;
    case "del":
      return `-${stats.deletions}`;
    case "commits":
      return String(stats.commits);
    case "tokens":
      return stats.tokensUsed.toLocaleString();
    case "cost":
      return formatCurrency(stats.costUSD);
    case "checks":
      if (!stats.checksResults || stats.checksResults.length === 0) {
        return "n/a";
      }
      return stats.checksResults.every((item) => item.passed) ? "✓" : "✗";
    case "risk":
      return stats.riskFlags.length === 0 ? "none" : truncate(stats.riskFlags[0], 16);
    default:
      return "-";
  }
}

export function PostMatch({ match, agents, selectedIndex }: PostMatchProps): React.JSX.Element {
  const left = agents[selectedIndex] ?? agents[0];
  const right = agents[(selectedIndex + 1) % Math.max(1, agents.length)] ?? agents[1] ?? left;

  const leftName = left ? truncate(left.entry.provider, 16) : "agent-a";
  const rightName = right ? truncate(right.entry.provider, 16) : "agent-b";

  const rows = [
    [statValue(left?.stats, "time"), "Time", statValue(right?.stats, "time")],
    [statValue(left?.stats, "first"), "First Output", statValue(right?.stats, "first")],
    [statValue(left?.stats, "files"), "Files Changed", statValue(right?.stats, "files")],
    [statValue(left?.stats, "ins"), "Insertions", statValue(right?.stats, "ins")],
    [statValue(left?.stats, "del"), "Deletions", statValue(right?.stats, "del")],
    [statValue(left?.stats, "commits"), "Commits", statValue(right?.stats, "commits")],
    [statValue(left?.stats, "tokens"), "Tokens Used", statValue(right?.stats, "tokens")],
    [statValue(left?.stats, "cost"), "Cost", statValue(right?.stats, "cost")],
    [statValue(left?.stats, "checks"), "Checks Passing", statValue(right?.stats, "checks")],
    [statValue(left?.stats, "risk"), "Risk Flags", statValue(right?.stats, "risk")]
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>┌─────────────────────────────────────────────────────────┐</Text>
      <Text>│                    MATCH COMPLETE                        │</Text>
      <Text>│ {truncate(`\"${match.prompt}\"`, 55).padEnd(55, " ")} │</Text>
      <Text>├──────────────────┬───────────────────┬──────────────────┤</Text>
      <Text>│{padCell(leftName)} │                   │{padCell(rightName)} │</Text>
      <Text>├──────────────────┼───────────────────┼──────────────────┤</Text>
      {rows.map((row) => (
        <Text key={row[1]}>
          │{padCell(row[0])} │ {row[1].padEnd(17, " ")} │{padCell(row[2])} │
        </Text>
      ))}
      <Text>├──────────────────┴───────────────────┴──────────────────┤</Text>
      <Text>│ [d] diff [←→] switch agent [b] preview [v] thread        │</Text>
      <Text>│ [w] pick winner [r] rematch [n] new match [?] help       │</Text>
      <Text>└─────────────────────────────────────────────────────────┘</Text>
    </Box>
  );
}
