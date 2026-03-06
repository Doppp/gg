export type PrivacyMode = "public" | "private" | "anonymous";

export interface GGSectionConfig {
  theme: "dark" | "light";
  default_time_limit: number;
  worktree_dir: string;
  default_prompt_strategy: "plain" | "competition";
}

export interface AgentConfig {
  enabled: boolean;
  api_key?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface CostConfig {
  match_budget_usd: number;
  daily_budget_usd: number;
  warn_threshold: number;
}

export interface SafetyConfig {
  allow_secrets: boolean;
}

export interface LeaderboardConfig {
  enabled: boolean;
  endpoint?: string;
  default_privacy: PrivacyMode;
}

export interface GGConfig {
  gg: GGSectionConfig;
  agents: Record<string, AgentConfig>;
  cost: CostConfig;
  safety: SafetyConfig;
  leaderboard: LeaderboardConfig;
}

export const DEFAULT_CONFIG: GGConfig = {
  gg: {
    theme: "dark",
    default_time_limit: 600,
    worktree_dir: ".gg-worktrees",
    default_prompt_strategy: "plain"
  },
  agents: {
    claude: {
      enabled: true,
      command: "claude",
      args: ["--dangerously-skip-permissions"]
    },
    codex: {
      enabled: true,
      command: "codex",
      args: []
    }
  },
  cost: {
    match_budget_usd: 5,
    daily_budget_usd: 20,
    warn_threshold: 0.8
  },
  safety: {
    allow_secrets: false
  },
  leaderboard: {
    enabled: false,
    endpoint: "https://gg.sh/api/match",
    default_privacy: "private"
  }
};
