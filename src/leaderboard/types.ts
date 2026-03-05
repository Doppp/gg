import type { MatchRecord } from "../match/types.js";

export interface LeaderboardEntry {
  provider: string;
  matches: number;
  wins: number;
  winRate: number;
  avgTimeToCompletion: number;
}

export type LeaderboardDataset = MatchRecord[];
