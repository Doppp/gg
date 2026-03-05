export interface PricingConfig {
  inputPerMillion: number;
  outputPerMillion: number;
}

export function estimateCostUSD(
  tokensUsed: number,
  pricing: PricingConfig = { inputPerMillion: 10, outputPerMillion: 30 },
  inputRatio = 0.7
): number {
  const inputTokens = tokensUsed * inputRatio;
  const outputTokens = tokensUsed - inputTokens;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}
