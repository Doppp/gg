import React from "react";
import { Box, Text } from "ink";
import { AgentPane, type LiveAgentPaneModel } from "./AgentPane.js";
import { theme } from "../theme.js";

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
      <Text bold color={theme.brand}>
        Dual Broadcast | MATCH LIVE
      </Text>
      <Text color={theme.muted}>
        prompt: {prompt && prompt.trim().length > 0 ? prompt : "(empty prompt)"} | elapsed: {elapsedSeconds ?? 0}s
      </Text>
      <Text color={theme.accent}>x stop all | [←→] switch focused agent | [d] diff [b] preview [v] thread (post-match)</Text>

      <Box marginTop={1}>
        {primary.map((pane) => (
          <AgentPane key={pane.id} pane={pane} focused={pane.id === focusedPaneId} />
        ))}
      </Box>

      {secondary.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted}>Additional Agents</Text>
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
