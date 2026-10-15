import type { TokenCounts } from "@agent-office/shared";

export function tokenTotal(counts: TokenCounts): string {
  if (counts.inputTokens === null && counts.outputTokens === null) return "Not reported";
  const total = (counts.inputTokens ?? 0) + (counts.outputTokens ?? 0);
  return `${total.toLocaleString()}${counts.inputTokens === null || counts.outputTokens === null ? " (partial)" : ""}`;
}

export function creditLabel(counts: Pick<TokenCounts, "aiCredits" | "aiCreditCalls" | "calls">) {
  // Responses from servers started before AI credits were added omit the field.
  if (counts.aiCredits == null) return "Not reported";
  const value = counts.aiCredits.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${value}${counts.aiCreditCalls < counts.calls ? " (partial)" : ""}`;
}
