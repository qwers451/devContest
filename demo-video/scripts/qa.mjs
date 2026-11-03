// Контрольные кадры: один бандл, кадры из середины и конца каждой сцены.
// node scripts/qa.mjs [out/qa]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const out = path.resolve(process.argv[2] ?? "out/qa");
fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const comp = await selectComposition({ serveUrl, id: "DevContestDemo", inputProps: { bgm: false } });
// Таблица сцен читается из DemoVideo.tsx — единственного источника тайминга.
const src = fs.readFileSync(path.resolve("src/DemoVideo.tsx"), "utf8");
const T = Number(src.match(/export const T = (\d+)/)[1]);
const SHOTS = [...src.matchAll(/\{ id: "([a-z]+)", dur: (\d+)/g)].map((m) => ({ id: m[1], dur: Number(m[2]) }));
// Длительности в таблице — в кадрах 30 fps, композиция — в FPS из time.ts.
const FPS = Number(fs.readFileSync(path.resolve("src/time.ts"), "utf8").match(/export const FPS = (\d+)/)[1]);
const f30 = (n) => Math.round((n * FPS) / 30);
const START = {};
SHOTS.reduce((at, s) => ((START[s.id] = at), at + f30(s.dur) - f30(T)), 0);
const only = process.argv[3] ? process.argv[3].split(",") : null;
for (const s of SHOTS.filter((x) => !only || only.includes(x.id))) {
  for (const k of [0.45, 0.9]) {
    const frame = Math.min(comp.durationInFrames - 1, START[s.id] + Math.round(f30(s.dur) * k));
    await renderStill({ serveUrl, composition: comp, frame, output: path.join(out, `${s.id}-${frame}.png`), inputProps: { bgm: false }, scale: Number(process.env.QA_SCALE ?? 0.5) });
  }
  console.log("still", s.id);
}
