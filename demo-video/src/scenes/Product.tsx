import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Counter } from "../components/Counter";
import { Kinetic, Mono } from "../components/Kinetic";
import { Chip, Graphite, Lead, Paper, TextCol } from "../components/Layout";
import { Shot } from "../components/Shot";
import { C, EASE, F, clamp } from "../theme";

/** 5. Модуль управления конкурсами: задание, сроки, критерии, призовой фонд. */
export const CreateContest: React.FC = () => (
  <Paper>
    <TextCol width={700}>
      <Kinetic text="Конкурс за пару минут" size={80} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <Chip delay={16}>Задание и ТЗ</Chip>
        <Chip delay={22}>Сроки и этапы</Chip>
        <Chip delay={28}>Критерии</Chip>
        <Chip delay={34}>Призовой фонд</Chip>
      </div>
      <Lead delay={40}>Заказчик сам делит фонд по местам и сразу видит, сколько получит каждый победитель.</Lead>
    </TextCol>
    <Shot
      src="shots/create.png"
      pageH={1758}
      w={960}
      h={820}
      style={{ position: "absolute", right: 100, top: 130 }}
      cam={[
        { f: 0, cx: 960, cy: 380, zoom: 0.92 },
        { f: 40, cx: 960, cy: 420, zoom: 0.92 },
        { f: 110, cx: 960, cy: 1060, zoom: 1.02 },
        { f: 150, cx: 960, cy: 1080, zoom: 1.08 },
      ]}
      tilt={[{ f: 0, ry: -8 }, { f: 150, ry: -3 }]}
    />
  </Paper>
);

/** 6. Платёжный модуль: резерв фонда и комиссия 10%. */
export const Payment: React.FC = () => {
  const frame = useCurrentFrame();
  const ring = interpolate(frame, [20, 70], [0, 0.1], { ...clamp, easing: EASE.inOut });
  const R = 170;
  const L = 2 * Math.PI * R;
  return (
    <Graphite field={0.7}>
      <div style={{ position: "absolute", left: 160, top: 0, bottom: 0, width: 820, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30 }}>
        <Kinetic text="Деньги в резерве до выбора победителей" size={84} color={C.gInk} accent={["резерве"]} accentColor={C.accent2} />
        <Lead delay={20} color={C.gMuted}>
          Призовой фонд оплачивается через ЮKassa и замораживается на платформе. Конкурс стартует, только когда деньги на месте.
        </Lead>
        <Mono delay={36} color={C.gMuted}>
          escrow · release-award · ЮKassa API
        </Mono>
      </div>
      <div style={{ position: "absolute", right: 220, top: 260, width: 560, height: 560 }}>
        <svg width={560} height={560} viewBox="0 0 560 560" aria-hidden>
          <circle cx={280} cy={280} r={R} fill="none" stroke="oklch(30% 0.03 262)" strokeWidth={34} />
          <circle
            cx={280}
            cy={280}
            r={R}
            fill="none"
            stroke={C.accent2}
            strokeWidth={34}
            strokeDasharray={`${L * ring} ${L}`}
            transform="rotate(-90 280 280)"
            strokeLinecap="butt"
          />
        </svg>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 150, color: C.gInk, letterSpacing: "-0.04em" }}>
            <Counter to={10} delay={20} dur={50} suffix="%" />
          </div>
          <div style={{ fontFamily: F.body, fontSize: 30, color: C.gMuted, marginTop: -8 }}>комиссия платформы</div>
        </AbsoluteFill>
      </div>
    </Graphite>
  );
};

/** 7. Лента конкурсов: наклонённая страница проезжает в кадре. */
export const ContestFeed: React.FC = () => (
  <Paper>
    <Shot
      src="shots/contests.png"
      pageH={1080}
      w={1500}
      h={860}
      style={{ position: "absolute", left: 360, top: 150 }}
      cam={[
        { f: 0, cx: 1100, cy: 360, zoom: 1.05 },
        { f: 130, cx: 1100, cy: 760, zoom: 1.05 },
      ]}
      tilt={[{ f: 0, rx: 24, rz: -6, ry: -10 }, { f: 130, rx: 18, rz: -4, ry: -6 }]}
    />
    <AbsoluteFill
      style={{
        background: `linear-gradient(90deg, ${C.paper} 0%, ${C.paper} 30%, oklch(98.6% 0.005 250 / 0) 52%)`,
      }}
    />
    <TextCol width={700}>
      <Kinetic text="Исполнители выбирают задачу" size={80} />
      <Lead delay={18}>Решения, макеты и прототипы загружаются прямо в конкурс и хранятся на платформе.</Lead>
    </TextCol>
  </Paper>
);

/** 8a. Оценка ИИ: наезд на блок с баллом и критериями. */
export const AiCheck: React.FC = () => (
  <Paper>
    <TextCol width={700}>
      <Kinetic text="ИИ сверяет каждое решение с ТЗ" size={80} accent={["ИИ"]} />
      <Lead delay={18}>Критерии извлекаются из текста задания. Заказчик видит балл, выполненные пункты и критические нарушения.</Lead>
    </TextCol>
    <Shot
      src="shots/solution.png"
      pageH={1180}
      w={980}
      h={760}
      style={{ position: "absolute", right: 80, top: 160 }}
      cam={[
        { f: 0, cx: 960, cy: 420, zoom: 0.72 },
        { f: 90, cx: 980, cy: 470, zoom: 1.35 },
        { f: 140, cx: 980, cy: 480, zoom: 1.42 },
      ]}
      tilt={[{ f: 0, ry: -10, rx: 4 }, { f: 140, ry: -2, rx: 0 }]}
    />
  </Paper>
);

/** 8b. Фокусный момент: большое число соответствия ТЗ. */
export const AiScore: React.FC = () => {
  const frame = useCurrentFrame();
  const bar = interpolate(frame, [10, 60], [0, 0.92], { ...clamp, easing: EASE.inOut });
  return (
    <Graphite field={1}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Mono color={C.gMuted} size={32}>
          оценка ИИ · соответствие ТЗ
        </Mono>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 300, lineHeight: 1, color: C.gInk, letterSpacing: "-0.05em", marginTop: 12 }}>
          <Counter to={92} delay={10} dur={50} suffix="%" />
        </div>
        <div style={{ width: 900, height: 14, borderRadius: 7, background: "oklch(30% 0.03 262)", overflow: "hidden", marginTop: 28 }}>
          <div style={{ width: "100%", height: "100%", background: C.accent2, transformOrigin: "left", transform: `scaleX(${bar})` }} />
        </div>
        <div style={{ marginTop: 36 }}>
          <Mono delay={44} color={C.gMuted} size={30}>
            4 критерия из ТЗ · LLaMA через Ollama · решение за заказчиком
          </Mono>
        </div>
      </AbsoluteFill>
    </Graphite>
  );
};

/** 9. Средства коммуникации: чат, уведомления, обсуждения. */
export const Communication: React.FC = () => (
  <Paper>
    <TextCol width={700}>
      <Kinetic text="Чат, уведомления и обсуждения" size={80} />
      <Lead delay={18}>Сообщения приходят мгновенно по WebSocket. О новых решениях, сроках и итогах платформа сообщает сама.</Lead>
    </TextCol>
    <Shot
      src="shots/chat.png"
      pageH={1080}
      w={980}
      h={660}
      style={{ position: "absolute", right: 140, top: 100 }}
      cam={[
        { f: 0, cx: 1100, cy: 420, zoom: 0.72 },
        { f: 140, cx: 1180, cy: 460, zoom: 0.9 },
      ]}
      tilt={[{ f: 0, ry: -10 }, { f: 140, ry: -4 }]}
    />
    <Shot
      src="shots/bell.png"
      pageH={1080}
      w={560}
      h={380}
      enter={46}
      radius={14}
      style={{ position: "absolute", right: 70, top: 640 }}
      cam={[{ f: 0, cx: 1500, cy: 170, zoom: 1.1 }, { f: 140, cx: 1500, cy: 180, zoom: 1.16 }]}
      tilt={[{ f: 0, ry: 8, rz: -2 }, { f: 140, ry: 4, rz: -1 }]}
    />
  </Paper>
);
