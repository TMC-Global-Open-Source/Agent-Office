import { randomUUID } from "node:crypto";
import { hexAvatarColor } from "@agent-office/shared";

export function randomAvatarColor(): string {
  return hexAvatarColor(randomUUID());
}
