export const officeViews = {
  isometric: { label: "Isometric", position: [12, 14, 12], up: [0, 1, 0], zoom: 50 },
  front: { label: "Front", position: [0, 22, 22], up: [0, 1, 0], zoom: 50 },
  left: { label: "Left", position: [-22, 22, 0], up: [0, 1, 0], zoom: 35 },
  right: { label: "Right", position: [22, 22, 0], up: [0, 1, 0], zoom: 35 },
  top: { label: "Top down", position: [0, 24, 0], up: [0, 0, -1], zoom: 22 },
} satisfies Record<
  string,
  { label: string; position: [number, number, number]; up: [number, number, number]; zoom: number }
>;

export type OfficeView = keyof typeof officeViews;
