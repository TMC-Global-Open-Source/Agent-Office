export interface DeskPosition {
  id: string;
  row: number;
  column: number;
  x: number;
  z: number;
}

export function stableAvatarColor(id: string): string {
  return hexAvatarColor(id);
}

export function hexAvatarColor(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) % 360;
  const saturation = 0.62;
  const lightness = 0.54;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const rgb =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${rgb
    .map((value) =>
      Math.round((value + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export const DESKS_PER_ROW = 5;

/** Reassigns desks to consecutive slots from the top-left, keeping their existing order. */
export function compactDesks<T extends Pick<DeskPosition, "row" | "column">>(desks: T[]): T[] {
  return [...desks]
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .map((desk, index) => ({
      ...desk,
      row: Math.floor(index / DESKS_PER_ROW),
      column: index % DESKS_PER_ROW,
    }));
}

export function nextDesk(
  existing: Array<Pick<DeskPosition, "row" | "column">>,
  id: string,
): DeskPosition {
  const occupied = new Set(existing.map(({ row, column }) => `${row}:${column}`));
  let index = 0;
  while (occupied.has(`${Math.floor(index / DESKS_PER_ROW)}:${index % DESKS_PER_ROW}`)) index += 1;
  const row = Math.floor(index / DESKS_PER_ROW);
  const column = index % DESKS_PER_ROW;
  return { id, row, column, x: (column - 2) * 3.2, z: row * 3.2 };
}
