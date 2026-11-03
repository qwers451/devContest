import React, { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, F } from "../theme";

// Поле символов на сетке, как фон hero лендинга: слева «сырые» решения (шум),
// справа — упорядоченные строки требований. Детерминировано: зависит только от кадра.
const CELL_W = 12;
const CELL_H = 24;
const RAMP = " .:-=+*#%";

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const noise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};

export const Field: React.FC<{ intensity?: number; dark?: boolean }> = ({ intensity = 1, dark = true }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${CELL_H - 6}px ${F.mono}`;
    ctx.textBaseline = "top";
    const cols = Math.ceil(width / CELL_W);
    const rows = Math.ceil(height / CELL_H);
    const time = frame / 120;
    const tints = dark ? C.glyph : ["oklch(89% 0.025 254)", "oklch(81% 0.045 255)", "oklch(70% 0.085 256)", "oklch(60% 0.13 257)"];
    for (let r = 0; r < rows; r++) {
      const isRow = r % 3 === 1;
      const len = 0.55 + 0.4 * hash(r, 7);
      for (let c = 0; c < cols; c++) {
        const u = c / cols;
        const raw = noise(c / 9 + time, r / 5 - time * 0.6) * 0.7 + noise(c / 3 - time, r / 2) * 0.3;
        const resolved = isRow && u - 0.5 < len * 0.5 ? 0.62 : 0.04;
        const s = smooth(Math.min(1, Math.max(0, (u - 0.32) / 0.4)));
        let v = ((raw - 0.35) * 1.4 * (1 - s) + resolved * s) * (0.45 + 0.55 * u) * intensity;
        if (v < 0.12) continue;
        v = Math.min(0.99, v);
        ctx.fillStyle = tints[Math.min(3, Math.floor(v * 4))];
        ctx.fillText(RAMP[Math.floor(v * RAMP.length)], c * CELL_W, r * CELL_H);
      }
    }
  }, [frame, width, height, intensity, dark]);

  return <canvas ref={ref} width={width} height={height} style={{ position: "absolute", inset: 0 }} />;
};
