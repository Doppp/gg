import type { MatchRecord } from "../match/types.js";

export function applyPrivacy(record: MatchRecord): MatchRecord {
  if (record.privacy === "private") {
    return {
      ...record,
      repo: null,
      prompt: null
    };
  }

  if (record.privacy === "anonymous") {
    return {
      ...record,
      repo: null
    };
  }

  return record;
}
