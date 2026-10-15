import { expect, it } from "vitest";
import { creditLabel, tokenTotal } from "./token-counts.js";

const none = { aiCredits: null, aiCreditCalls: 0 };

it("keeps unavailable, partial and recorded zero counts distinct", () => {
  expect(tokenTotal({ inputTokens: null, outputTokens: null, calls: 0, ...none })).toBe(
    "Not reported",
  );
  expect(tokenTotal({ inputTokens: 0, outputTokens: 0, calls: 1, ...none })).toBe("0");
  expect(tokenTotal({ inputTokens: null, outputTokens: 12, calls: 1, ...none })).toBe(
    "12 (partial)",
  );
  expect(tokenTotal({ inputTokens: 12, outputTokens: 3, calls: 1, ...none })).toBe("15");
});

it("labels recorded AI credits and flags partial coverage", () => {
  expect(creditLabel({ aiCredits: null, aiCreditCalls: 0, calls: 2 })).toBe("Not reported");
  expect(creditLabel({ aiCredits: 0, aiCreditCalls: 1, calls: 1 })).toBe("0.0");
  expect(creditLabel({ aiCredits: 12.345, aiCreditCalls: 2, calls: 2 })).toBe("12.3");
  expect(creditLabel({ aiCredits: 4, aiCreditCalls: 1, calls: 2 })).toBe("4.0 (partial)");
  expect(creditLabel({ aiCreditCalls: 0, calls: 1 } as never)).toBe("Not reported");
});
