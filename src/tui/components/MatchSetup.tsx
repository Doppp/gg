import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

export interface SetupAgentOption {
  provider: string;
  command: string;
  version: string;
}

interface MatchSetupProps {
  isActive: boolean;
  prompt: string;
  isEditingPrompt: boolean;
  selectedAgentProviders: string[];
  availableAgents: SetupAgentOption[];
  timeLimitSeconds: number;
  onPromptChange: (prompt: string) => void;
  onSetPromptEditing: (editing: boolean) => void;
  onToggleAgent: (provider: string) => void;
  onTimeLimitChange: (seconds: number) => void;
}

const MIN_TIME_LIMIT = 60;
const MAX_TIME_LIMIT = 7200;

export function MatchSetup(props: MatchSetupProps): React.JSX.Element {
  const {
    isActive,
    prompt,
    isEditingPrompt,
    selectedAgentProviders,
    availableAgents,
    timeLimitSeconds,
    onPromptChange,
    onSetPromptEditing,
    onToggleAgent,
    onTimeLimitChange
  } = props;

  const [focusIndex, setFocusIndex] = useState(0);
  const [agentCursor, setAgentCursor] = useState(0);

  const selectedCount = selectedAgentProviders.length;
  const promptPreview = useMemo(() => {
    if (prompt.length === 0) {
      return "(empty prompt)";
    }
    return prompt;
  }, [prompt]);

  useEffect(() => {
    if (availableAgents.length === 0) {
      setAgentCursor(0);
      return;
    }
    if (agentCursor > availableAgents.length - 1) {
      setAgentCursor(availableAgents.length - 1);
    }
  }, [agentCursor, availableAgents.length]);

  useInput(
    (input, key) => {
      if (isEditingPrompt) {
        if (key.escape || (key.ctrl && input.toLowerCase() === "s")) {
          onSetPromptEditing(false);
          return;
        }
        if (key.backspace || key.delete) {
          onPromptChange(prompt.slice(0, -1));
          return;
        }
        if (key.return) {
          onPromptChange(`${prompt}\n`);
          return;
        }
        if (input.length > 0) {
          onPromptChange(`${prompt}${input}`);
        }
        return;
      }

      if (key.tab) {
        setFocusIndex((current) => (current + 1) % 3);
        return;
      }

      if (focusIndex === 1 && availableAgents.length > 0 && (key.upArrow || input === "k")) {
        setAgentCursor((current) => (current - 1 + availableAgents.length) % availableAgents.length);
        return;
      }
      if (focusIndex === 1 && availableAgents.length > 0 && (key.downArrow || input === "j")) {
        setAgentCursor((current) => (current + 1) % availableAgents.length);
        return;
      }

      if (focusIndex !== 1 && key.upArrow) {
        setFocusIndex((current) => (current - 1 + 3) % 3);
        return;
      }
      if (focusIndex !== 1 && key.downArrow) {
        setFocusIndex((current) => (current + 1) % 3);
        return;
      }

      if (focusIndex === 0 && key.return) {
        onSetPromptEditing(true);
        return;
      }

      if (focusIndex === 1 && input === " " && availableAgents[agentCursor]) {
        onToggleAgent(availableAgents[agentCursor].provider);
        return;
      }

      if (focusIndex === 1 && input.toLowerCase() === "a") {
        for (const agent of availableAgents) {
          if (!selectedAgentProviders.includes(agent.provider)) {
            onToggleAgent(agent.provider);
          }
        }
        return;
      }

      if (focusIndex === 2 && (key.leftArrow || input === "-")) {
        onTimeLimitChange(Math.max(MIN_TIME_LIMIT, timeLimitSeconds - 60));
        return;
      }

      if (focusIndex === 2 && (key.rightArrow || input === "+")) {
        onTimeLimitChange(Math.min(MAX_TIME_LIMIT, timeLimitSeconds + 60));
      }
    },
    { isActive }
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Match Setup</Text>
      <Text dimColor>Tab focus | Enter edit prompt | Space start match | 1-7 switch tabs</Text>

      <Box marginTop={1} borderStyle="round" borderColor={focusIndex === 0 ? "green" : "gray"} paddingX={1} flexDirection="column">
        <Text>
          {focusIndex === 0 ? ">" : " "} Prompt {isEditingPrompt ? "(editing, Esc/Ctrl+S to stop)" : "(press Enter to edit)"}
        </Text>
        <Text>{promptPreview}</Text>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={focusIndex === 1 ? "green" : "gray"} paddingX={1} flexDirection="column">
        <Text>{focusIndex === 1 ? ">" : " "} Agents (pick 2+)</Text>
        {availableAgents.length === 0 ? (
          <Text color="yellow">No compatible agents detected. Install `claude` or `codex` CLI.</Text>
        ) : (
          availableAgents.map((agent, index) => {
            const isSelected = selectedAgentProviders.includes(agent.provider);
            const isCursor = focusIndex === 1 && index === agentCursor;
            return (
              <Text key={`${agent.provider}:${agent.command}`}>
                {isCursor ? ">" : " "} [{isSelected ? "x" : " "}] {agent.provider} ({agent.version})
              </Text>
            );
          })
        )}
        <Text dimColor>
          Selected: {selectedCount} | Space toggle | j/k move cursor | a select all
        </Text>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={focusIndex === 2 ? "green" : "gray"} paddingX={1} flexDirection="column">
        <Text>{focusIndex === 2 ? ">" : " "} Time Limit</Text>
        <Text>{Math.floor(timeLimitSeconds / 60)} min ({timeLimitSeconds}s)</Text>
        <Text dimColor>Use left/right arrows or +/- to adjust</Text>
      </Box>
    </Box>
  );
}
