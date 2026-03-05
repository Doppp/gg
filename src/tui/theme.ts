export type TUIColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray";

export const theme = {
  brand: "cyan" as TUIColor,
  accent: "magenta" as TUIColor,
  focus: "blue" as TUIColor,
  muted: "gray" as TUIColor,
  success: "green" as TUIColor,
  warning: "yellow" as TUIColor,
  danger: "red" as TUIColor
};

export function statusColor(status: string): TUIColor {
  if (status === "running") return theme.success;
  if (status === "completed") return theme.success;
  if (status === "merged") return theme.success;
  if (status === "spawning" || status === "branching") return theme.warning;
  if (status === "reviewing") return theme.brand;
  if (status === "failed" || status === "cancelled") return theme.danger;
  if (status === "timeout") return theme.warning;
  return theme.muted;
}

export function modeColor(mode: string): TUIColor {
  if (mode === "setup") return theme.brand;
  if (mode === "branching") return theme.warning;
  if (mode === "racing") return theme.success;
  if (mode === "reviewing") return theme.accent;
  if (mode === "merged") return theme.success;
  return theme.muted;
}
