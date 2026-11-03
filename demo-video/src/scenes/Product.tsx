import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { useT } from "../time";
import { Counter } from "../components/Counter";
import { Kinetic, Mono } from "../components/Kinetic";
import { Graphite, Lead, UI, UiScene } from "../components/Layout";
import { Shot } from "../components/Shot";
import { C, EASE, F, clamp } from "../theme";

/** 5. Модуль управления конкурсами: камера идёт по форме от ТЗ к призовому фонду. */
export const CreateContest: React.FC = () => (
  <UiScene title="Конкурс за пару минут" note="задание · сроки · критерии · призовой фонд">
    <Shot
      src="shots/create.png"
      pageH={1758}
      w={UI.w}
      h={UI.h}
      style={{ position: "absolute", left: UI.x, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 330, zoom: 1.75 },
        { f: 30, cx: 960, cy: 330, zoom: 1.75 },
        { f: 95, cx: 960, cy: 760, zoom: 1.75 },
        { f: 160, cx: 960, cy: 1080, zoom: 1.75 },
      ]}
      tilt={[{ f: 0, rx: 8 }, { f: 22, rx: 0 }]}
    />
  </UiScene>
);

/** 6. Платёжный модуль: резерв фонда и комиссия 10%. */
export const Payment: React.FC = () => {
  const frame = useT();
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

/** 7. Лента конкурсов: наклонённая лента въезжает и выпрямляется. */
export const ContestFeed: React.FC = () => (
  <UiScene title="Исполнители выбирают задачу" note="решения и макеты хранятся в конкурсе">
    <Shot
      src="shots/contests.png"
      pageH={1080}
      w={UI.w}
      h={UI.h}
      style={{ position: "absolute", left: UI.x, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 470, zoom: 1.22 },
        { f: 130, cx: 960, cy: 660, zoom: 1.22 },
      ]}
      tilt={[{ f: 0, rx: 16, rz: -3 }, { f: 40, rx: 0, rz: 0 }]}
    />
  </UiScene>
);

/** 8a. Оценка ИИ: наезд на блок с баллом и критериями. */
export const AiCheck: React.FC = () => (
  <UiScene title="ИИ сверяет каждое решение с ТЗ" accent={["ИИ"]} note="критерии извлекаются из задания">
    <Shot
      src="shots/solution.png"
      pageH={1180}
      w={UI.w}
      h={UI.h}
      style={{ position: "absolute", left: UI.x, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 540, zoom: 0.92 },
        { f: 70, cx: 960, cy: 470, zoom: 1.85 },
        { f: 140, cx: 960, cy: 480, zoom: 1.85 },
      ]}
    />
  </UiScene>
);

/** 8b. Фокусный момент: большое число соответствия ТЗ. */
export const AiScore: React.FC = () => {
  const frame = useT();
  const bar = interpolate(frame, [20, 70], [0, 0.92], { ...clamp, easing: EASE.inOut });
  return (
    <Graphite field={1}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Mono color={C.gMuted} size={32}>
          оценка ИИ · соответствие ТЗ
        </Mono>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 300, lineHeight: 1, color: C.gInk, letterSpacing: "-0.05em", marginTop: 12 }}>
          <Counter to={92} delay={20} dur={50} suffix="%" />
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

/** 9. Средства коммуникации: переписка крупно, поверх — открытые уведомления. */
export const Communication: React.FC = () => (
  <UiScene title="Чат, уведомления и обсуждения" note="сообщения приходят по WebSocket">
    <Shot
      src="shots/chat.png"
      pageH={1080}
      w={UI.w}
      h={UI.h}
      style={{ position: "absolute", left: UI.x, top: UI.y }}
      cam={[
        { f: 0, cx: 960, cy: 560, zoom: 1.24 },
        { f: 140, cx: 960, cy: 540, zoom: 1.26 },
      ]}
    />
    <Shot
      src="shots/bell.png"
      pageH={1080}
      w={720}
      h={480}
      enter={50}
      radius={14}
      style={{ position: "absolute", right: 110, bottom: 70 }}
      cam={[{ f: 0, cx: 1146, cy: 232, zoom: 1.14 }, { f: 140, cx: 1146, cy: 232, zoom: 1.16 }]}
    />
  </UiScene>
);
