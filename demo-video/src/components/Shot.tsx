import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { useT } from "../time";
import { C, EASE, clamp } from "../theme";

export type CamKey = { f: number; cx: number; cy: number; zoom: number };
export type TiltKey = { f: number; rx?: number; ry?: number; rz?: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Значение на ключах в момент `frame`.
 * Плавность: одна кривая ease-in-out на весь путь от первого ключа до последнего,
 * промежуточные ключи — точки, через которые камера проходит без остановки.
 * Два одинаковых ключа подряд дают осознанную паузу.
 */
function sample<K extends { f: number }>(keys: K[], frame: number, pick: (k: K) => number[]): number[] {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (keys.length === 1 || frame <= first.f) return pick(first);
  if (frame >= last.f) return pick(last);
  const p = (frame - first.f) / (last.f - first.f);
  const u = first.f + EASE.cam(p) * (last.f - first.f);
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].f) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (u - a.f) / (b.f - a.f);
  const va = pick(a);
  const vb = pick(b);
  return va.map((v, j) => lerp(v, vb[j], t));
}

/**
 * Окно с настоящим скриншотом и камерой внутри.
 * (cx, cy) — точка страницы в CSS px, которая стоит в центре окна; zoom — масштаб.
 * Масштаб интерполируется в логарифме — каждый процент приближения занимает одинаковое время.
 * Камера — 2D transform с субпиксельной точностью (без рывков по целым пикселям);
 * наклон в 3D бывает только на входе в сцену, дальше кадр плоский и резкий.
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
}> = ({ src, pageW = 1920, pageH, w, h, cam, tilt, radius = 16, enter = 0, style, children }) => {
  const frame = useT();
  const [cx, cy, logZoom] = sample(cam, frame, (k) => [k.cx, k.cy, Math.log(k.zoom)]);
  const zoom = Math.exp(logZoom);
  const [rx, ry, rz] = tilt ? sample(tilt, frame, (k) => [k.rx ?? 0, k.ry ?? 0, k.rz ?? 0]) : [0, 0, 0];
  const t = interpolate(frame, [enter, enter + 22], [0, 1], { ...clamp, easing: EASE.out });
  const flat = Math.abs(rx) + Math.abs(ry) + Math.abs(rz) < 0.01;
  return (
    <div style={{ perspective: 2600, ...style }}>
      <div
        style={{
          width: w,
          height: h,
          position: "relative",
          overflow: "hidden",
          borderRadius: radius,
          background: C.paper2,
          border: `1px solid ${C.rule2}`,
          boxShadow: "0 2px 4px oklch(21% 0.028 262 / 0.06), 0 40px 80px -40px oklch(21% 0.028 262 / 0.4)",
          opacity: t,
          transform: flat && t === 1 ? undefined : `translateY(${(1 - t) * 40}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`,
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
