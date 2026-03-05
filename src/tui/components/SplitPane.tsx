import React from "react";
import { Box, Text } from "ink";
import { AgentPane, type LiveAgentPaneModel } from "./AgentPane.js";

interface SplitPaneProps {
  panes: LiveAgentPaneModel[];
}

export function SplitPane({ panes }: SplitPaneProps): React.JSX.Element {
  if (panes.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color="yellow">No live agent panes yet.</Text>
      </Box>
    );
  }

  const primary = panes.slice(0, 2);
  const secondary = panes.slice(2);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Live Match</Text>
      <Text dimColor>x stop all agents early</Text>

      <Box marginTop={1}>
        {primary.map((pane) => (
          <AgentPane key={pane.id} pane={pane} />
        ))}
      </Box>

      {secondary.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Additional Agents</Text>
          {secondary.map((pane) => (
            <Box key={pane.id}>
              <AgentPane pane={pane} />
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
