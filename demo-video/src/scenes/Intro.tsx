import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Kinetic, Mono } from "../components/Kinetic";
import { Graphite, Lead, Paper, TextCol, Wordmark } from "../components/Layout";
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
  const frame = useCurrentFrame();
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

/** 3. Лендинг: камера наезжает на hero. */
export const Landing: React.FC = () => (
  <Paper>
    <TextCol width={700}>
      <Kinetic text="Для компаний, стартапов и специалистов" size={84} />
      <Lead delay={18}>Творческие и технические конкурсы в цифровом формате: заказчик получает несколько готовых решений и платит за лучшие.</Lead>
    </TextCol>
    <Shot
      src="shots/landing.png"
      pageH={1080}
      w={980}
      h={720}
      style={{ position: "absolute", right: 90, top: 180 }}
      cam={[
        { f: 0, cx: 960, cy: 540, zoom: 0.54 },
        { f: 120, cx: 760, cy: 520, zoom: 0.78 },
      ]}
      tilt={[
        { f: 0, ry: -14, rx: 6 },
        { f: 120, ry: -4, rx: 2 },
      ]}
    />
  </Paper>
);

/** 4. Личные кабинеты заказчика и исполнителя. */
export const Cabinets: React.FC = () => (
  <Paper>
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 96 }}>
      <Kinetic text="Личные кабинеты заказчиков и исполнителей" size={84} align="center" />
    </AbsoluteFill>
    <Shot
      src="shots/wallet.png"
      pageH={1080}
      w={780}
      h={560}
      enter={10}
      style={{ position: "absolute", left: 150, top: 330 }}
      cam={[
        { f: 0, cx: 960, cy: 300, zoom: 0.7 },
        { f: 110, cx: 960, cy: 330, zoom: 0.78 },
      ]}
      tilt={[{ f: 0, ry: 12 }, { f: 110, ry: 6 }]}
    />
    <Shot
      src="shots/solution.png"
      pageH={1180}
      w={780}
      h={560}
      enter={22}
      style={{ position: "absolute", right: 150, top: 330 }}
      cam={[
        { f: 0, cx: 960, cy: 330, zoom: 0.62 },
        { f: 110, cx: 960, cy: 380, zoom: 0.7 },
      ]}
      tilt={[{ f: 0, ry: -12 }, { f: 110, ry: -6 }]}
    />
    <Label x={150} text="Заказчик: кошелёк, конкурсы, выплаты" delay={30} />
    <Label x={990} text="Исполнитель: решения, оценки, отзывы" delay={40} />
  </Paper>
);

const Label: React.FC<{ x: number; text: string; delay: number }> = ({ x, text, delay }) => (
  <div style={{ position: "absolute", left: x, top: 920, width: 780 }}>
    <Mono delay={delay} color={C.ink2} size={30}>
      {text}
    </Mono>
  </div>
);
