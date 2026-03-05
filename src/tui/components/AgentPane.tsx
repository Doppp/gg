import React from "react";
import { Box, Text } from "ink";
import { statusColor, theme } from "../theme.js";

export interface LiveAgentPaneModel {
  id: string;
  provider: string;
  status: string;
  pid?: number;
  branch?: string;
  riskFlags: string[];
  lines: string[];
}

interface AgentPaneProps {
  pane: LiveAgentPaneModel;
  focused?: boolean;
}

export function AgentPane({ pane, focused = false }: AgentPaneProps): React.JSX.Element {
  const outputLines = pane.lines.slice(-18);
  const statusTint = statusColor(pane.status);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? theme.brand : theme.muted}
      paddingX={1}
      width="50%"
      marginRight={1}
    >
      <Text bold color={focused ? theme.brand : undefined}>
        {focused ? ">" : " "} {pane.provider.toUpperCase()}
      </Text>
      <Text>
        <Text color={theme.muted}>Status: </Text>
        <Text color={statusTint}>{pane.status}</Text>
        {pane.pid ? ` | pid ${pane.pid}` : ""}
      </Text>
      {pane.branch ? (
        <Text>
          <Text color={theme.muted}>Branch: </Text>
          <Text color={theme.accent}>{pane.branch}</Text>
        </Text>
      ) : null}
      {pane.riskFlags.length > 0 ? (
        <Text color={theme.danger}>Risk: {pane.riskFlags[pane.riskFlags.length - 1]}</Text>
      ) : (
        <Text color={theme.muted}>Risk: none</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {outputLines.length === 0 ? (
          <Text color={theme.muted}>(no output yet)</Text>
        ) : (
          outputLines.map((line, idx) => <Text key={`${pane.id}-${idx}`}>{line}</Text>)
        )}
      </Box>
    </Box>
  );
}
