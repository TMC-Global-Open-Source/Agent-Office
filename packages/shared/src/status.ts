import type { AgentState, StatusEvidence } from "./model.js";

export interface StatusDecision {
  status: AgentState;
  reason: string;
  evidence: StatusEvidence[];
  confidence: number;
  kind: "direct" | "inferred" | "mock";
}

const priority: Record<AgentState, number> = {
  needs_attention: 0,
  failed: 1,
  working: 2,
  queued: 3,
  completed: 4,
  idle: 5,
  spawning: 6,
  offline: 7,
};

export function inferStatus(
  evidence: StatusEvidence[],
  fallback: AgentState = "idle",
): StatusDecision {
  if (evidence.length === 0) {
    return {
      status: fallback,
      reason: fallback === "idle" ? "No recent active evidence." : `Provider state: ${fallback}.`,
      evidence: [],
      confidence: 0.4,
      kind: "inferred",
    };
  }
  const classify = (item: StatusEvidence): AgentState | null => {
    const text = `${item.kind} ${item.description}`.toLowerCase();
    if (/block|question|attention|requested action|missing access/.test(text))
      return "needs_attention";
    if (/fail|error/.test(text)) return "failed";
    if (/queued|pending/.test(text)) return "queued";
    if (/progress|commit|updated|active|running/.test(text)) return "working";
    if (/complete|success|merged/.test(text)) return "completed";
    return null;
  };
  const candidates = evidence
    .map((item) => ({ item, status: classify(item) }))
    .filter(
      (candidate): candidate is { item: StatusEvidence; status: AgentState } =>
        candidate.status !== null,
    )
    .sort(
      (a, b) =>
        priority[a.status] - priority[b.status] ||
        b.item.observedAt.localeCompare(a.item.observedAt),
    );
  const chosen = candidates[0];
  if (!chosen) {
    return {
      status: fallback,
      reason: "No recognized status evidence.",
      evidence,
      confidence: 0.35,
      kind: "inferred",
    };
  }
  return {
    status: chosen.status,
    reason: chosen.item.description,
    evidence,
    confidence: chosen.item.confidence,
    kind: "inferred",
  };
}
