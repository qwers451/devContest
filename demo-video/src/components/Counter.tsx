import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE, clamp } from "../theme";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");

/** Число досчитывается от `from` до `to` за `dur` кадров (ease-out). */
export const Counter: React.FC<{ to: number; from?: number; delay?: number; dur?: number; suffix?: string; style?: React.CSSProperties }> = ({
  to,
  from = 0,
  delay = 0,
  dur = 36,
  suffix = "",
  style,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + dur], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {fmt(from + (to - from) * t)}
      {suffix}
    </span>
  );
};
