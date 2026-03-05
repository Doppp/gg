import React from "react";
import { Box, Text } from "ink";

const HELP_ROWS: Array<[string, string]> = [
  ["1-7", "switch views"],
  ["q / Ctrl+C", "quit"],
  ["Enter", "select / confirm"],
  ["Esc", "back / close overlay"],
  ["Space", "start match (from setup)"],
  ["x", "stop all agents early"],
  ["d", "show git diff"],
  ["b", "preview branch"],
  ["v", "view match thread"],
  ["w", "pick winner"],
  ["r", "rematch"],
  ["n", "new match"],
  ["s", "sort column"],
  ["/", "search / filter"],
  ["?", "toggle help overlay"]
];

export function HelpOverlay(): React.JSX.Element {
  return (
    <Box borderStyle="double" borderColor="cyan" flexDirection="column" paddingX={1}>
      <Text bold>Help</Text>
      {HELP_ROWS.map(([key, description]) => (
        <Text key={key}>
          {key.padEnd(10, " ")} {description}
        </Text>
      ))}
      <Text dimColor>Press Esc or ? to close.</Text>
    </Box>
  );
}
