export function normalizePathForMatch(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "::DOUBLE_STAR::")
    .replaceAll("*", "[^/]*")
    .replaceAll("::DOUBLE_STAR::", ".*")
    .replaceAll("?", "[^/]");

  return new RegExp(`^${escaped}$`);
}

export function matchesAnyPattern(filePath: string, patterns: readonly string[]): boolean {
  const normalized = normalizePathForMatch(filePath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}
