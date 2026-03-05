import React from "react";
import { Box, Text } from "ink";

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

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={1}
      width="50%"
      marginRight={1}
    >
      <Text bold>
        {focused ? ">" : " "} {pane.provider.toUpperCase()}
      </Text>
      <Text dimColor>
        Status: {pane.status}
        {pane.pid ? ` | pid ${pane.pid}` : ""}
      </Text>
      {pane.branch ? <Text dimColor>Branch: {pane.branch}</Text> : null}
      {pane.riskFlags.length > 0 ? (
        <Text color="red">Risk: {pane.riskFlags[pane.riskFlags.length - 1]}</Text>
      ) : (
        <Text dimColor>Risk: none</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {outputLines.length === 0 ? (
          <Text dimColor>(no output yet)</Text>
        ) : (
          outputLines.map((line, idx) => <Text key={`${pane.id}-${idx}`}>{line}</Text>)
        )}
      </Box>
    </Box>
  );
}
