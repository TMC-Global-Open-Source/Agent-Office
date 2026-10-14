import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { hexAvatarColor } from "@agent-office/shared";
import { randomAvatarColor } from "../src/avatar-color.js";

vi.mock("node:crypto", () => ({ randomUUID: vi.fn() }));

describe("joining avatar colors", () => {
  it("uses fresh random identities to produce readable hex colors", () => {
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    vi.mocked(randomUUID).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const colors = [randomAvatarColor(), randomAvatarColor()];
    expect(colors).toEqual([hexAvatarColor(first), hexAvatarColor(second)]);
    expect(colors[0]).not.toBe(colors[1]);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });
});
