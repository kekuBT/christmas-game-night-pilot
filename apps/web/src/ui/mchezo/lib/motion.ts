// Reduced-motion resolution (Milestone J.1) — pure, unit-tested.
// The device OS preference is a floor, not a suggestion: if the OS
// prefers reduced motion, the kit reduces even when the in-app
// animation setting is "full". The in-app setting can only reduce
// further (Reduced/Off). This makes the SettingsBar claim true —
// "Reduced motion in your device settings also reduces animations
// here" — which was false for kit screens before this fix (the kit
// previously read only the in-app setting).
export function resolveReducedMotion(
  anim: "full" | "reduced" | "off",
  osPrefersReducedMotion: boolean,
): boolean {
  return anim !== "full" || osPrefersReducedMotion;
}
