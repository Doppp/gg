import React from "react";
import { Box, Text } from "ink";
import { AgentPane, type LiveAgentPaneModel } from "./AgentPane.js";

interface SplitPaneProps {
  panes: LiveAgentPaneModel[];
  focusedPaneId?: string;
  prompt?: string;
  elapsedSeconds?: number;
}

export function SplitPane({ panes, focusedPaneId, prompt, elapsedSeconds }: SplitPaneProps): React.JSX.Element {
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
      <Text bold>Dual Broadcast | MATCH LIVE</Text>
      <Text dimColor>
        prompt: {prompt && prompt.trim().length > 0 ? prompt : "(empty prompt)"} | elapsed: {elapsedSeconds ?? 0}s
      </Text>
      <Text dimColor>x stop all | [←→] switch focused agent | [d] diff [b] preview [v] thread (post-match)</Text>

      <Box marginTop={1}>
        {primary.map((pane) => (
          <AgentPane key={pane.id} pane={pane} focused={pane.id === focusedPaneId} />
        ))}
      </Box>

      {secondary.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Additional Agents</Text>
          {secondary.map((pane) => (
            <Box key={pane.id}>
              <AgentPane pane={pane} focused={pane.id === focusedPaneId} />
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
