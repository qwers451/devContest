import React from "react";
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { EASE } from "./theme";
import { f30 } from "./time";
import { Cabinets, Hook, Landing, Turn } from "./scenes/Intro";
import { AiCheck, AiScore, Communication, ContestFeed, CreateContest, Payment } from "./scenes/Product";
import { Advantages, Metrics, Mobile, Outro, Payout, Rating, Stack } from "./scenes/Outcome";

// Единственный источник правды по таймингу: порядок сцен, длительности и переходы.
// Длительности — в кадрах 30 fps (см. time.ts); в настоящие кадры их переводит f30().
// Звуки и переходы ниже вычисляются из этой таблицы.
export const T = 18; // длительность перехода между сценами
type Cut = "fade" | "slide";
export const SHOTS: { id: string; dur: number; C: React.FC; cut: Cut }[] = [
  { id: "hook", dur: 96, C: Hook, cut: "fade" },
  { id: "turn", dur: 120, C: Turn, cut: "fade" },
  { id: "landing", dur: 130, C: Landing, cut: "fade" },
  { id: "cabinets", dur: 120, C: Cabinets, cut: "slide" },
  { id: "create", dur: 160, C: CreateContest, cut: "slide" },
  { id: "payment", dur: 120, C: Payment, cut: "fade" },
  { id: "feed", dur: 130, C: ContestFeed, cut: "fade" },
  { id: "ai", dur: 140, C: AiCheck, cut: "slide" },
  { id: "score", dur: 110, C: AiScore, cut: "fade" },
  { id: "comms", dur: 140, C: Communication, cut: "fade" },
  { id: "payout", dur: 140, C: Payout, cut: "slide" },
  { id: "rating", dur: 130, C: Rating, cut: "slide" },
  { id: "metrics", dur: 130, C: Metrics, cut: "slide" },
  { id: "mobile", dur: 110, C: Mobile, cut: "fade" },
  { id: "stack", dur: 105, C: Stack, cut: "fade" },
  { id: "advantages", dur: 120, C: Advantages, cut: "fade" },
  { id: "outro", dur: 190, C: Outro, cut: "fade" },
];

/** Начало каждой сцены на общей шкале, в настоящих кадрах (с учётом наложения переходов). */
export const START: Record<string, number> = {};
{
  let at = 0;
  SHOTS.forEach((s, i) => {
    START[s.id] = at;
    at += f30(s.dur) - (i < SHOTS.length - 1 ? f30(T) : 0);
  });
}
export const TOTAL = SHOTS.reduce((sum, s) => sum + f30(s.dur), 0) - f30(T) * (SHOTS.length - 1);

// Звуковые акценты, привязанные к сценам относительными кадрами.
const SFX: { at: number; src: string; volume: number; dur?: number }[] = [
  { at: START.turn + f30(44), src: "impact-transition.mp3", volume: 0.5, dur: f30(60) }, // появление знака devContest
  ...SHOTS.slice(2).map((s) => ({ at: START[s.id] - f30(6), src: s.cut === "slide" ? "swoosh-quick.mp3" : "transition-soft.mp3", volume: 0.22, dur: f30(30) })),
  { at: START.payment + f30(20), src: "bass-hit-short.mp3", volume: 0.4, dur: f30(30) }, // счётчик 10%
  { at: START.score + f30(20), src: "whoosh-fast.mp3", volume: 0.3, dur: f30(30) }, // полоса оценки ИИ
  { at: START.score + f30(68), src: "bass-hit-short.mp3", volume: 0.45, dur: f30(30) }, // 92% встаёт
  { at: START.mobile + f30(10), src: "switch-click-quick.mp3", volume: 0.35, dur: f30(15) }, // телефоны
  { at: START.outro + f30(110), src: "impact-transition.mp3", volume: 0.55, dur: f30(70) }, // финальный знак
  { at: START.outro + f30(128), src: "shimmer-sparkle-sweep.mp3", volume: 0.3, dur: f30(60) }, // послезвучие
];

export type DemoProps = { bgm: boolean };

export const DemoVideo: React.FC<DemoProps> = ({ bgm }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {SHOTS.map((s, i) => (
          <React.Fragment key={s.id}>
            <TransitionSeries.Sequence name={s.id} durationInFrames={f30(s.dur)}>
              <s.C />
            </TransitionSeries.Sequence>
            {i < SHOTS.length - 1 && (
              <TransitionSeries.Transition
                presentation={SHOTS[i + 1].cut === "slide" ? slide({ direction: "from-right" }) : fade()}
                timing={linearTiming({ durationInFrames: f30(T), easing: EASE.inOut })}
              />
            )}
          </React.Fragment>
        ))}
      </TransitionSeries>

      {bgm && (
        <Audio
          src={staticFile("audio/house-vibez.mp3")}
          volume={(f) => 0.32 * interpolate(f, [0, 1.5 * fps, TOTAL - 2.5 * fps, TOTAL], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
      )}
      {SFX.map((s, i) => (
        <Sequence key={i} from={s.at} durationInFrames={s.dur ?? f30(45)} name={`sfx ${s.src}`}>
          <Audio src={staticFile(`audio/${s.src}`)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
