import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { useT } from "../time";
import { Kinetic, Mono } from "../components/Kinetic";
import { Graphite, UI, UiScene, Wordmark } from "../components/Layout";
import { Shot } from "../components/Shot";
import { C, EASE, clamp } from "../theme";

/** 1. Крючок: проблема одного подрядчика. */
export const Hook: React.FC = () => (
  <Graphite field={0.55}>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 }}>
      <Kinetic text="Нужно сделать сайт." size={124} color={C.gInk} align="center" />
      <Kinetic text="Один подрядчик — одна попытка." delay={26} size={84} color={C.gMuted} weight={500} align="center" />
    </AbsoluteFill>
  </Graphite>
);

/** 2. Поворот: конкурс вместо подрядчика, появление знака. */
export const Turn: React.FC = () => {
  const frame = useT();
  const mark = interpolate(frame, [46, 70], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <Graphite field={1}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 56 }}>
        <Kinetic text="А если попросить десятерых?" size={110} color={C.gInk} accent={["десятерых"]} accentColor={C.accent2} align="center" exitAt={40} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: mark, transform: `scale(${0.94 + 0.06 * mark})`, filter: `blur(${(1 - mark) * 10}px)` }}>
        <Wordmark size={150} color={C.gInk} />
        <div style={{ marginTop: 36 }}>
          <Mono delay={60} color={C.gMuted} size={36}>
            платформа конкурсного фриланса
          </Mono>
        </div>
      </AbsoluteFill>
    </Graphite>
  );
};

/** 3. Лендинг: камера проходит по hero почти на весь кадр. */
export const Landing: React.FC = () => (
  <UiScene title="Для компаний, стартапов и специалистов" note="творческие и технические конкурсы">
    <Shot
      src="shots/landing.png"
      pageH={1080}
      w={UI.w}
      h={UI.h}
      style={{ position: "absolute", left: UI.x, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 540, zoom: 0.92 },
        { f: 140, cx: 960, cy: 555, zoom: 1.16 },
      ]}
      tilt={[{ f: 0, rx: 8 }, { f: 22, rx: 0 }]}
    />
  </UiScene>
);

/** 4. Личные кабинеты заказчика и исполнителя: два больших окна рядом. */
export const Cabinets: React.FC = () => (
  <UiScene title="Личные кабинеты заказчиков и исполнителей">
    <Shot
      src="shots/wallet.png"
      pageH={1080}
      w={862}
      h={UI.h - 70}
      enter={4}
      style={{ position: "absolute", left: UI.x, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 380, zoom: 1.04 },
        { f: 120, cx: 960, cy: 360, zoom: 1.08 },
      ]}
    />
    <Shot
      src="shots/solution.png"
      pageH={1180}
      w={862}
      h={UI.h - 70}
      enter={14}
      style={{ position: "absolute", left: UI.x + 898, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 380, zoom: 0.92 },
        { f: 120, cx: 960, cy: 470, zoom: 0.92 },
      ]}
    />
    <Label x={UI.x} text="Заказчик: кошелёк, конкурсы, выплаты" delay={26} />
    <Label x={UI.x + 898} text="Исполнитель: решения, оценки, отзывы" delay={34} />
  </UiScene>
);

const Label: React.FC<{ x: number; text: string; delay: number }> = ({ x, text, delay }) => (
  <div style={{ position: "absolute", left: x, top: UI.y + UI.h - 44, width: 862 }}>
    <Mono delay={delay} color={C.ink2} size={28}>
      {text}
    </Mono>
  </div>
);
