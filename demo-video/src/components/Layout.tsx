import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, EASE, F, clamp } from "../theme";
import { Field } from "./Field";

/** Светлая сцена: бумага Cobalt и едва заметная сетка точек. */
export const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: C.paper,
      backgroundImage: `radial-gradient(${C.rule} 1.2px, transparent 1.6px)`,
      backgroundSize: "24px 24px",
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Тёмная сцена-перебивка: графит и поле символов. */
export const Graphite: React.FC<{ children: React.ReactNode; field?: number }> = ({ children, field = 0.85 }) => (
  <AbsoluteFill style={{ background: C.graphite }}>
    <Field intensity={field} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, oklch(19% 0.024 262 / 0.92), oklch(19% 0.024 262 / 0.35))" }} />
    {children}
  </AbsoluteFill>
);

/** Левая колонка с текстом сцены. */
export const TextCol: React.FC<{ children: React.ReactNode; top?: number; width?: number }> = ({ children, top = 0, width = 720 }) => (
  <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width, display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, paddingTop: top }}>
    {children}
  </div>
);

/** Сопроводительный абзац под заголовком. */
export const Lead: React.FC<{ children: React.ReactNode; delay?: number; color?: string; size?: number }> = ({ children, delay = 14, color = C.ink2, size = 40 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 20], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <div style={{ fontFamily: F.body, fontSize: size, lineHeight: 1.4, color, opacity: t, transform: `translateY(${(1 - t) * 16}px)`, maxWidth: 680 }}>
      {children}
    </div>
  );
};

/** Знак продукта: логотип и словесный знак. */
export const Wordmark: React.FC<{ size?: number; color?: string }> = ({ size = 96, color = C.ink }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
    <Img src={staticFile("brand/logo.svg")} style={{ width: size * 0.9, height: size * 0.9 }} />
    <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: size, letterSpacing: "-0.03em", color }}>devContest</span>
  </div>
);

/** Метка-«чип» в материале Cobalt. */
export const Chip: React.FC<{ children: React.ReactNode; delay?: number; dark?: boolean }> = ({ children, delay = 0, dark }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 16], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 64,
        padding: "0 28px",
        borderRadius: 10,
        fontFamily: F.display,
        fontWeight: 500,
        fontSize: 32,
        color: dark ? C.gInk : C.ink,
        background: dark ? C.graphite2 : C.panel,
        border: `1px solid ${dark ? "oklch(36% 0.03 262)" : C.rule2}`,
        boxShadow: dark ? "none" : "0 2px 0 0 oklch(80% 0.016 254)",
        opacity: t,
        transform: `translateY(${(1 - t) * 18}px) scale(${0.94 + 0.06 * t})`,
      }}
    >
      {children}
    </span>
  );
};
