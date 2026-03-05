import React from "react";
import { Box, Text } from "ink";
import type { MatchThread as MatchThreadType } from "../../match/types.js";
import { theme } from "../theme.js";

interface MatchThreadProps {
  thread?: MatchThreadType;
}

function icon(type: string): string {
  if (type === "prompt") return "P";
  if (type === "agent_started") return ">";
  if (type === "stdout") return ".";
  if (type === "stderr") return "!";
  if (type === "file_created") return "+";
  if (type === "file_modified") return "~";
  if (type === "file_deleted") return "-";
  if (type === "command_executed") return "$";
  if (type === "risk_flag") return "!";
  if (type === "check_result") return "C";
  if (type === "agent_exited") return "X";
  return "*";
}

function renderEvent(event: MatchThreadType["events"][number]): string {
  const ts = event.timestamp.slice(11, 19);

  if (event.type === "stdout" || event.type === "stderr") {
    return `${ts} ${icon(event.type)} ${event.content.trim()}`;
  }

  if (event.type === "prompt") {
    return `${ts} ${icon(event.type)} ${event.content}`;
  }

  if (event.type === "agent_started") {
    return `${ts} ${icon(event.type)} pid=${event.pid}`;
  }

  if (event.type === "command_executed") {
    return `${ts} ${icon(event.type)} ${event.command}`;
  }

  if (event.type === "risk_flag") {
    return `${ts} ${icon(event.type)} ${event.reason}${event.path ? ` (${event.path})` : ""}`;
  }

  if (event.type === "check_result") {
    return `${ts} ${icon(event.type)} ${event.name}: ${event.passed ? "pass" : "fail"}`;
  }

  if (event.type === "agent_exited") {
    return `${ts} ${icon(event.type)} exit=${event.code}${event.signal ? ` signal=${event.signal}` : ""}`;
  }

  if (event.type === "file_modified") {
    return `${ts} ${icon(event.type)} ${event.path} (+${event.insertions}/-${event.deletions})`;
  }

  if (event.type === "file_created" || event.type === "file_deleted") {
    return `${ts} ${icon(event.type)} ${event.path}`;
  }

  const fallback = event as { type: string };
  return `${ts} ${icon(fallback.type)} ${fallback.type}`;
}

export function MatchThread({ thread }: MatchThreadProps): React.JSX.Element {
  if (!thread) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text bold color={theme.brand}>
          Match Thread
        </Text>
        <Text color={theme.muted}>No thread selected.</Text>
      </Box>
    );
  }

  const events = thread.events.slice(-80);

  return (
    <Box paddingX={1} flexDirection="column">
      <Text bold color={theme.brand}>
        Match Thread: {thread.provider} ({thread.agentId})
      </Text>
      {events.map((event, idx) => (
        <Text key={`${event.timestamp}-${idx}`} color={event.type === "risk_flag" || event.type === "stderr" ? theme.danger : undefined}>
          {renderEvent(event)}
        </Text>
      ))}
    </Box>
  );
}
