import fs from "node:fs";
import path from "node:path";
import type { MatchRecord } from "../match/types.js";

export function writeMatchRecord(outputDir: string, record: MatchRecord): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "match.json");
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return filePath;
}
