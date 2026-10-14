export function loungePersonality(id: string) {
  const seed = [...id].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return { variant: seed % 3, phase: (seed % 628) / 100 };
}

export function loungePose(
  id: string,
  time: number,
  reducedMotion: boolean,
  variant = loungePersonality(id).variant,
) {
  const { phase } = loungePersonality(id);
  const breath = reducedMotion ? 0 : Math.sin(time * 0.9 + phase);
  const gesture = reducedMotion ? 0 : Math.max(0, Math.sin(time * 0.4 + phase)) ** 10;
  return {
    variant,
    bodyX: variant === 2 ? -0.12 - gesture * 0.06 : -0.035,
    bodyY: breath * 0.004,
    headX: variant === 0 ? 0.18 + breath * 0.025 : variant === 2 ? -0.08 : -gesture * 0.08,
    headY: reducedMotion ? 0 : Math.sin(time * 0.28 + phase) * 0.09,
    leftArmX: variant === 0 ? -0.65 : variant === 2 ? -gesture * 2.3 : 0.05,
    rightArmX: variant === 0 ? -0.65 : variant === 1 ? -0.3 - gesture * 1.65 : -gesture * 2.3,
    leftArmZ: variant === 2 ? 0.12 + gesture * 0.2 : 0,
    rightArmZ: variant === 2 ? -0.12 - gesture * 0.2 : 0,
    footX: reducedMotion ? 0 : Math.sin(time * 1.3 + phase) * 0.045,
  };
}
