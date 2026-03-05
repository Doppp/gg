import type { MatchRecord } from "../match/types.js";

export async function uploadMatchRecord(_endpoint: string, _record: MatchRecord): Promise<void> {
  throw new Error("Leaderboard upload is not implemented yet.");
}
