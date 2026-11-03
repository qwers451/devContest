import React from "react";
import { AbsoluteFill, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Cabinets, Hook, Landing, Turn } from "./scenes/Intro";
import { AiCheck, AiScore, Communication, ContestFeed, CreateContest, Payment } from "./scenes/Product";
import { Advantages, Metrics, Mobile, Outro, Payout, Rating, Stack } from "./scenes/Outcome";

// Единственный источник правды по таймингу: порядок сцен, длительности и переходы.
// Звуки и переходы ниже вычисляются из этой таблицы.
export const T = 14; // длительность перехода между сценами, кадров
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

/** Начало каждой сцены на общей шкале (с учётом наложения переходов). */
export const START: Record<string, number> = {};
{
  let at = 0;
  SHOTS.forEach((s, i) => {
    START[s.id] = at;
    at += s.dur - (i < SHOTS.length - 1 ? T : 0);
  });
}
export const TOTAL = SHOTS.reduce((sum, s) => sum + s.dur, 0) - T * (SHOTS.length - 1);

// Звуковые акценты, привязанные к сценам относительными кадрами.
const SFX: { at: number; src: string; volume: number; dur?: number }[] = [
  { at: START.turn + 44, src: "impact-transition.mp3", volume: 0.5, dur: 60 }, // появление знака devContest
  ...SHOTS.slice(2).map((s) => ({ at: START[s.id] - 6, src: s.cut === "slide" ? "swoosh-quick.mp3" : "transition-soft.mp3", volume: 0.22, dur: 30 })),
  { at: START.payment + 20, src: "bass-hit-short.mp3", volume: 0.4, dur: 30 }, // счётчик 10%
  { at: START.score + 10, src: "whoosh-fast.mp3", volume: 0.3, dur: 30 }, // полоса оценки ИИ
  { at: START.score + 58, src: "bass-hit-short.mp3", volume: 0.45, dur: 30 }, // 92% встаёт
  { at: START.mobile + 10, src: "switch-click-quick.mp3", volume: 0.35, dur: 15 }, // телефоны
  { at: START.outro + 110, src: "impact-transition.mp3", volume: 0.55, dur: 70 }, // финальный знак
  { at: START.outro + 128, src: "shimmer-sparkle-sweep.mp3", volume: 0.3, dur: 60 }, // послезвучие
];

export type DemoProps = { bgm: boolean };

export const DemoVideo: React.FC<DemoProps> = ({ bgm }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {SHOTS.map((s, i) => (
          <React.Fragment key={s.id}>
            <TransitionSeries.Sequence name={s.id} durationInFrames={s.dur}>
              <s.C />
            </TransitionSeries.Sequence>
            {i < SHOTS.length - 1 && (
              <TransitionSeries.Transition
                presentation={SHOTS[i + 1].cut === "slide" ? slide({ direction: "from-right" }) : fade()}
                timing={linearTiming({ durationInFrames: T })}
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
        <Sequence key={i} from={s.at} durationInFrames={s.dur ?? 45} name={`sfx ${s.src}`}>
          <Audio src={staticFile(`audio/${s.src}`)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
