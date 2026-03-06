import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

const HELP_ROWS: Array<[string, string]> = [
  ["1-7", "switch views"],
  ["Tab / Shift+Tab", "next/prev setup focus"],
  ["q / Ctrl+C", "quit"],
  ["Enter", "select / confirm"],
  ["Esc", "back / close overlay"],
  ["Space", "start match (from setup)"],
  ["p", "toggle competition prompt (setup)"],
  ["x", "stop all agents early"],
  ["d", "show git diff"],
  ["b", "preview branch"],
  ["v", "view match thread"],
  ["t", "open focused worktree shell"],
  ["u/c/s/g", "test/build/serve/run focused worktree"],
  ["w", "pick winner"],
  ["r", "rematch"],
  ["n", "new match"],
  ["s", "sort column"],
  ["/", "search / filter"],
  ["?", "toggle help overlay"]
];

export function HelpOverlay(): React.JSX.Element {
  return (
    <Box borderStyle="double" borderColor={theme.brand} flexDirection="column" paddingX={1}>
      <Text bold color={theme.brand}>
        Help
      </Text>
      {HELP_ROWS.map(([key, description]) => (
        <Text key={key}>
          <Text color={theme.accent}>{key.padEnd(16, " ")}</Text>
          <Text color={theme.muted}>{description}</Text>
        </Text>
      ))}
      <Text color={theme.muted}>Press Esc or ? to close.</Text>
    </Box>
  );
}
