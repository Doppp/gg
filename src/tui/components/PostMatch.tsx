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

function summaryChecks(stats: AgentMatchStats | undefined): string {
  if (!stats?.checksResults || stats.checksResults.length === 0) {
    return "n/a";
  }

  const passed = stats.checksResults.filter((item) => item.passed).length;
  return `${passed}/${stats.checksResults.length}`;
}

function outcomeLabel(match: Match, entry: AgentEntry, stats: AgentMatchStats | undefined): string {
  if (match.winnerId) {
    return match.winnerId === entry.id ? "winner" : "loser";
  }

  if (stats?.outcome === "dnf" || entry.status === "failed" || entry.status === "timeout") {
    return "dnf";
  }

  return "pending";
}

function buildDetailLines(match: Match, model: PostMatchAgentModel): string[] {
  const stats = model.stats;

  return [
    `outcome: ${outcomeLabel(match, model.entry, stats)}`,
    `time: ${formatDuration(Math.round(stats?.timeToCompletion ?? 0))}  first: ${formatDuration(Math.round(stats?.timeToFirstOutput ?? 0))}`,
    `files: ${stats?.filesChanged ?? 0}  +${stats?.insertions ?? 0}/-${stats?.deletions ?? 0}  commits: ${stats?.commits ?? 0}`,
    `tokens: ${(stats?.tokensUsed ?? 0).toLocaleString()}  cost: ${formatCurrency(stats?.costUSD ?? 0)}`,
    `checks: ${summaryChecks(stats)}`,
    `risk: ${stats?.riskFlags && stats.riskFlags.length > 0 ? truncate(stats.riskFlags[0], 60) : "none"}`
  ];
}

export function PostMatch({ match, agents, selectedIndex }: PostMatchProps): React.JSX.Element {
  const left = agents[selectedIndex] ?? agents[0];
  const right = agents[(selectedIndex + 1) % Math.max(1, agents.length)] ?? agents[1] ?? left;

  const leftName = left ? left.entry.provider.toUpperCase() : "AGENT-A";
  const rightName = right ? right.entry.provider.toUpperCase() : "AGENT-B";

  const leftLines = left ? buildDetailLines(match, left) : [];
  const rightLines = right ? buildDetailLines(match, right) : [];

  const maxRows = Math.max(leftLines.length, rightLines.length);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Dual Broadcast | MATCH COMPLETE ({match.winnerId ? "DECIDED" : "UNDECIDED"})</Text>
      <Text dimColor>
        "{truncate(match.prompt, 72)}" | duration: {Math.round(match.stats.duration)}s
      </Text>

      <Box marginTop={1}>
        <Box width="50%" borderStyle="round" borderColor="cyan" paddingX={1} marginRight={1} flexDirection="column">
          <Text bold>
            {">"} {leftName}
          </Text>
          {Array.from({ length: maxRows }).map((_, idx) => (
            <Text key={`left-${idx}`}>{leftLines[idx] ?? ""}</Text>
          ))}
        </Box>

        <Box width="50%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text bold>{rightName}</Text>
          {Array.from({ length: maxRows }).map((_, idx) => (
            <Text key={`right-${idx}`}>{rightLines[idx] ?? ""}</Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>[d] diff [←→] switch focus [b] preview [v] thread</Text>
        <Text dimColor>[w] pick winner [r] rematch [n] new match [?] help</Text>
      </Box>
    </Box>
  );
}
