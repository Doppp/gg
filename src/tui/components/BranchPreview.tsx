import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

interface BranchPreviewProps {
  title: string;
  content: string;
}

export function BranchPreview({ title, content }: BranchPreviewProps): React.JSX.Element {
  const lines = content.length === 0 ? ["(empty)"] : content.split(/\r?\n/).slice(0, 60);

  return (
    <Box paddingX={1} flexDirection="column" borderStyle="round" borderColor={theme.accent}>
      <Text bold color={theme.accent}>
        {title}
      </Text>
      {lines.map((line, index) => (
        <Text key={`${title}-${index}`}>{line}</Text>
      ))}
    </Box>
  );
}
