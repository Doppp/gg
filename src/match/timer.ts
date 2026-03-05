export interface MatchTimer {
  startedAt: number;
  timeLimitSeconds: number;
  elapsedSeconds: () => number;
  remainingSeconds: () => number;
  hasTimedOut: () => boolean;
}

export function createMatchTimer(timeLimitSeconds: number): MatchTimer {
  const startedAt = Date.now();

  return {
    startedAt,
    timeLimitSeconds,
    elapsedSeconds: () => Math.floor((Date.now() - startedAt) / 1000),
    remainingSeconds: () => Math.max(0, timeLimitSeconds - Math.floor((Date.now() - startedAt) / 1000)),
    hasTimedOut: () => Date.now() - startedAt >= timeLimitSeconds * 1000
  };
}
