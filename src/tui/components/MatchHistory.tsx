import React from "react";
import { Box, Text } from "ink";
import type { MatchListItem } from "../../store/queries.js";
import { theme } from "../theme.js";

interface MatchHistoryProps {
  matches: MatchListItem[];
}

export function MatchHistory({ matches }: MatchHistoryProps): React.JSX.Element {
  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold color={theme.brand}>
        Match History
      </Text>
      <Text color={theme.muted}>id                       status      winner      started</Text>
      {matches.length === 0 ? <Text color={theme.muted}>(no persisted matches)</Text> : null}
      {matches.map((item) => (
        <Text key={item.id} color={item.status === "merged" ? theme.success : undefined}>
          {item.id.padEnd(24, " ")}
          {item.status.padEnd(12, " ")}
          {(item.winnerId ?? "-").padEnd(12, " ")}
          {item.startedAt}
        </Text>
      ))}
    </Box>
  );
}
