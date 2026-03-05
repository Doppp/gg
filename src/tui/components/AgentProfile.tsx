import React from "react";
import { Box, Text } from "ink";
import type { AgentProfile as AgentProfileType } from "../../match/types.js";

interface AgentProfileProps {
  profile: AgentProfileType | null;
}

export function AgentProfile({ profile }: AgentProfileProps): React.JSX.Element {
  if (!profile) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text bold>Agent Profile</Text>
        <Text dimColor>No profile selected or no data yet.</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold>Agent Profile: {profile.provider}</Text>
      <Text>
        matches={profile.matches} wins={profile.wins} losses={profile.losses} dnfs={profile.dnfs} winRate={(
          profile.winRate * 100
        ).toFixed(1)}%
      </Text>
      <Text>
        avgTime={profile.avgTimeToCompletion.toFixed(1)}s avgFiles={profile.avgFilesChanged.toFixed(1)} avgInsertions={profile.avgInsertions.toFixed(1)}
      </Text>
      <Text>
        avgTokens={profile.avgTokensUsed.toFixed(1)} avgCost=${profile.avgCostPerMatch.toFixed(2)} totalTokens={profile.totalTokens}
      </Text>
      <Text>
        totalCost=${profile.totalCostUSD.toFixed(2)} streak={profile.currentStreak} bestStreak={profile.bestStreak}
      </Text>
    </Box>
  );
}
