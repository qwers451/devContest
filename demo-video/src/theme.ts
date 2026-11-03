import { Easing } from "remotion";
import { loadFont as loadOnest } from "@remotion/google-fonts/Onest";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Те же токены Cobalt, что у сайта и лендинга.
export const C = {
  paper: "oklch(98.6% 0.005 250)",
  paper2: "oklch(96.2% 0.008 252)",
  panel: "oklch(99.6% 0.002 250)",
  ink: "oklch(21% 0.028 262)",
  ink2: "oklch(36% 0.022 260)",
  muted: "oklch(52% 0.018 258)",
  rule: "oklch(90% 0.009 252)",
  rule2: "oklch(83% 0.012 252)",
  accent: "oklch(52% 0.19 258)",
  accentDeep: "oklch(43% 0.2 262)",
  accent2: "oklch(76% 0.13 254)",
  wash: "oklch(95% 0.028 256)",
  graphite: "oklch(19% 0.024 262)",
  graphite2: "oklch(26.5% 0.026 262)",
  gInk: "oklch(95% 0.010 250)",
  gMuted: "oklch(69% 0.022 256)",
  glyph: ["oklch(33% 0.03 262)", "oklch(41% 0.05 260)", "oklch(53% 0.1 258)", "oklch(64% 0.14 257)"],
  success: "oklch(48% 0.12 152)",
} as const;

export const F = {
  display: loadOnest("normal", { weights: ["500", "600"], subsets: ["cyrillic", "latin"] }).fontFamily,
  body: loadPlex("normal", { weights: ["400", "500"], subsets: ["cyrillic", "latin"] }).fontFamily,
  mono: loadMono("normal", { weights: ["400", "500"], subsets: ["cyrillic", "latin"] }).fontFamily,
};

// Профиль «профессиональное доверие»: сильный ease-out без отскока, движение по экрану — ease-in-out.
export const EASE = {
  out: Easing.bezier(0.23, 1, 0.32, 1),
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  cam: Easing.bezier(0.33, 0, 0.15, 1),
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
