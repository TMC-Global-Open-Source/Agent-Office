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
const secretSequences = [[..."party"], konami];
const longest = Math.max(...secretSequences.map((sequence) => sequence.length));

/** Appends a key to the recent-key buffer and reports whether a secret sequence was completed. */
export function pushSecretKey(
  buffer: string[],
  key: string,
): { buffer: string[]; matched: boolean } {
  const next = [...buffer, key.toLowerCase()].slice(-longest);
  const matched = secretSequences.some(
    (sequence) =>
      next.length >= sequence.length &&
      sequence.every((expected, index) => next[next.length - sequence.length + index] === expected),
  );
  return { buffer: matched ? [] : next, matched };
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Calls `onParty` when "party" or the Konami code is typed outside a form field. */
export function useSecretParty(onParty: () => void) {
  const callback = useRef(onParty);
  callback.current = onParty;
  useEffect(() => {
    let buffer: string[] = [];
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const result = pushSecretKey(buffer, event.key);
      buffer = result.buffer;
      if (result.matched) callback.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
