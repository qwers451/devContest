import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, EASE, F, clamp } from "../theme";

/**
 * Фраза проявляется по словам: из размытия и снизу, с шагом stagger кадров.
 * Слова в `accent` красятся акцентом (одно ключевое слово на фразу).
 */
export const Kinetic: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  size?: number;
  color?: string;
  accent?: string[];
  accentColor?: string;
  weight?: number;
  align?: "left" | "center";
  exitAt?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, stagger = 4, size = 120, color = C.ink, accent = [], accentColor = C.accent, weight = 600, align = "left", exitAt, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  const exit = exitAt === undefined ? 1 : interpolate(frame, [exitAt, exitAt + 10], [1, 0], { ...clamp, easing: EASE.out });
  return (
    <div
      style={{
        fontFamily: F.display,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.06,
        letterSpacing: "-0.028em",
        color,
        textAlign: align,
        opacity: exit,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const start = delay + i * stagger;
        const t = interpolate(frame, [start, start + 18], [0, 1], { ...clamp, easing: EASE.out });
        const isAccent = accent.includes(w.replace(/[.,?!]/g, ""));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.26em",
              opacity: t,
              filter: `blur(${(1 - t) * 14}px)`,
              transform: `translateY(${(1 - t) * 0.22}em)`,
              color: isAccent ? accentColor : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Короткая подпись в моноширинном шрифте: источник, технология, единица. */
export const Mono: React.FC<{ children: React.ReactNode; delay?: number; color?: string; size?: number; style?: React.CSSProperties }> = ({
  children,
  delay = 0,
  color = C.muted,
  size = 30,
  style,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 16], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <div style={{ fontFamily: F.mono, fontSize: size, color, opacity: t, transform: `translateY(${(1 - t) * 10}px)`, ...style }}>
      {children}
    </div>
  );
};
