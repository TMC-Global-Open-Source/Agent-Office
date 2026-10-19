import { useEffect, useRef } from "react";

const konami = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];
const secretSequences = [[..."party"], konami, [..."boss"]];
const longest = Math.max(...secretSequences.map((sequence) => sequence.length));

/** Appends a key to the recent-key buffer and reports whether a secret sequence was completed. */
export function pushSecretKey(
  buffer: string[],
  key: string,
): { buffer: string[]; matched: boolean; action: "party" | "boss" | null } {
  const next = [...buffer, key.toLowerCase()].slice(-longest);
  const matched = secretSequences.some(
    (sequence) =>
      next.length >= sequence.length &&
      sequence.every((expected, index) => next[next.length - sequence.length + index] === expected),
  );
  const action = matched ? (next.slice(-4).join("") === "boss" ? "boss" : "party") : null;
  return { buffer: matched ? [] : next, matched, action };
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Handles office Easter eggs typed outside form fields. */
export function useSecretParty(onParty: () => void, onBoss: () => void) {
  const callback = useRef({ onParty, onBoss });
  callback.current = { onParty, onBoss };
  useEffect(() => {
    let buffer: string[] = [];
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        buffer = [];
        return;
      }
      const result = pushSecretKey(buffer, event.key);
      buffer = result.buffer;
      if (result.action === "party") callback.current.onParty();
      if (result.action === "boss") callback.current.onBoss();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
