import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, EASE, clamp } from "../theme";

export type CamKey = { f: number; cx: number; cy: number; zoom: number };
export type TiltKey = { f: number; rx?: number; ry?: number; rz?: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function sample<K extends { f: number }>(keys: K[], frame: number, pick: (k: K) => number[]): number[] {
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i].f && frame <= keys[i + 1].f) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  if (frame < keys[0].f) b = a;
  const t = a.f === b.f ? 1 : interpolate(frame, [a.f, b.f], [0, 1], { ...clamp, easing: EASE.cam });
  const va = pick(a);
  const vb = pick(b);
  return va.map((v, i) => lerp(v, vb[i], t));
}

/**
 * Окно с настоящим скриншотом и камерой внутри.
 * (cx, cy) — точка страницы в CSS px, которая стоит в центре окна; zoom — масштаб.
 * Снаружи окно можно наклонять в 3D (tilt), чтобы получить 2.5D-проезд.
 */
export const Shot: React.FC<{
  src: string;
  pageW?: number;
  pageH: number;
  w: number;
  h: number;
  cam: CamKey[];
  tilt?: TiltKey[];
  radius?: number;
  enter?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ src, pageW = 1920, pageH, w, h, cam, tilt, radius = 18, enter = 0, style, children }) => {
  const frame = useCurrentFrame();
  const [cx, cy, zoom] = sample(cam, frame, (k) => [k.cx, k.cy, k.zoom]);
  const [rx, ry, rz] = tilt ? sample(tilt, frame, (k) => [k.rx ?? 0, k.ry ?? 0, k.rz ?? 0]) : [0, 0, 0];
  const t = interpolate(frame, [enter, enter + 22], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <div style={{ perspective: 2200, ...style }}>
      <div
        style={{
          width: w,
          height: h,
          position: "relative",
          overflow: "hidden",
          borderRadius: radius,
          background: C.paper2,
          border: `1px solid ${C.rule2}`,
          boxShadow: "0 2px 4px oklch(21% 0.028 262 / 0.06), 0 40px 80px -40px oklch(21% 0.028 262 / 0.45)",
          opacity: t,
          transform: `translateY(${(1 - t) * 40}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${0.96 + 0.04 * t})`,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: pageW,
            height: pageH,
            transformOrigin: "0 0",
            transform: `translate(${w / 2 - cx * zoom}px, ${h / 2 - cy * zoom}px) scale(${zoom})`,
          }}
        >
          <Img src={staticFile(src)} style={{ width: pageW, height: pageH, display: "block" }} />
          {children}
        </div>
      </div>
    </div>
  );
};
