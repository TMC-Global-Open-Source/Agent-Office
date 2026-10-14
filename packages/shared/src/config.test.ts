import { describe, expect, it } from "vitest";
import { ConfigSchema, defaultConfig } from "./model.js";

describe("office title configuration", () => {
  it("defaults legacy settings and trims titles", () => {
    const legacy: Partial<typeof defaultConfig> = { ...defaultConfig };
    delete legacy.officeTitle;
    expect(ConfigSchema.parse(legacy).officeTitle).toBe("Good work happens together.");
    expect(ConfigSchema.parse({ ...legacy, officeTitle: "  Our office  " }).officeTitle).toBe(
      "Our office",
    );
  });
  it("rejects empty and overly long titles", () => {
    for (const officeTitle of ["", "   ", "a".repeat(121)]) {
      expect(ConfigSchema.safeParse({ ...defaultConfig, officeTitle }).success).toBe(false);
    }
    expect(ConfigSchema.safeParse({ ...defaultConfig, officeTitle: "a".repeat(120) }).success).toBe(
      true,
    );
  });
});
