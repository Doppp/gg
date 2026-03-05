import React from "react";
import { Box, Text } from "ink";
import type { MatchListItem } from "../../store/queries.js";

interface MatchHistoryProps {
  matches: MatchListItem[];
}

export function MatchHistory({ matches }: MatchHistoryProps): React.JSX.Element {
  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold>Match History</Text>
      <Text>id                       status      winner      started</Text>
      {matches.length === 0 ? <Text dimColor>(no persisted matches)</Text> : null}
      {matches.map((item) => (
        <Text key={item.id}>
          {item.id.padEnd(24, " ")}
          {item.status.padEnd(12, " ")}
          {(item.winnerId ?? "-").padEnd(12, " ")}
          {item.startedAt}
        </Text>
      ))}
    </Box>
  );
}
