import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Counter } from "../components/Counter";
import { Kinetic, Mono } from "../components/Kinetic";
import { Chip, Graphite, Lead, Paper, TextCol, Wordmark } from "../components/Layout";
import { Shot } from "../components/Shot";
import { C, EASE, F, clamp } from "../theme";

/** 10. Выбор победителей и автоматическое распределение вознаграждений. */
export const Payout: React.FC = () => (
  <Paper>
    <TextCol width={700}>
      <Kinetic text="Победители получают призы автоматически" size={80} />
      <Lead delay={18}>Заказчик распределяет места, платформа переводит призы на кошельки за вычетом комиссии.</Lead>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 76, color: C.success, letterSpacing: "-0.03em" }}>
        <Counter to={167400} delay={40} dur={46} suffix=" ₽" />
        <div style={{ fontFamily: F.body, fontWeight: 400, fontSize: 30, color: C.muted, letterSpacing: 0 }}>на руки за первое место</div>
      </div>
    </TextCol>
    <Shot
      src="shots/results.png"
      pageH={1180}
      w={980}
      h={760}
      style={{ position: "absolute", right: 90, top: 160 }}
      cam={[
        { f: 0, cx: 960, cy: 420, zoom: 0.8 },
        { f: 130, cx: 960, cy: 330, zoom: 1.12 },
      ]}
      tilt={[{ f: 0, ry: -10, rx: 6 }, { f: 130, ry: -3, rx: 2 }]}
    />
  </Paper>
);

/** 11. Модуль рейтингов и цифровое портфолио. */
export const Rating: React.FC = () => (
  <Paper>
    <TextCol width={700}>
      <Kinetic text="Подтверждённый рейтинг и портфолио" size={80} />
      <Lead delay={18}>Победы, отзывы заказчиков и оценки ИИ складываются в публичный рейтинг исполнителя.</Lead>
    </TextCol>
    <Shot
      src="shots/profile.png"
      pageH={1295}
      w={980}
      h={700}
      style={{ position: "absolute", right: 150, top: 90 }}
      cam={[
        { f: 0, cx: 960, cy: 300, zoom: 0.74 },
        { f: 130, cx: 960, cy: 640, zoom: 0.8 },
      ]}
      tilt={[{ f: 0, ry: -10 }, { f: 130, ry: -4 }]}
    />
    <Shot
      src="shots/top.png"
      pageH={1080}
      w={620}
      h={330}
      enter={40}
      radius={14}
      style={{ position: "absolute", right: 70, top: 690 }}
      cam={[{ f: 0, cx: 960, cy: 330, zoom: 0.62 }, { f: 130, cx: 960, cy: 350, zoom: 0.66 }]}
      tilt={[{ f: 0, ry: 8, rz: -2 }, { f: 130, ry: 4 }]}
    />
  </Paper>
);

/** 12. Измеряемые параметры продукта — в админ-панели. */
export const Metrics: React.FC = () => {
  const items = [
    "Активные конкурсы и пользователи",
    "Среднее время до завершения конкурса",
    "Заявок на конкурс и средний призовой фонд",
    "Доля успешно завершённых конкурсов",
  ];
  return (
    <Paper>
      <TextCol width={700}>
        <Kinetic text="Метрики платформы в одном окне" size={80} />
        <div style={{ display: "grid", gap: 18 }}>
          {items.map((t, i) => (
            <Mono key={t} delay={18 + i * 8} color={C.ink2} size={32}>
              {String(i + 1).padStart(2, "0")} {t}
            </Mono>
          ))}
        </div>
      </TextCol>
      <Shot
        src="shots/admin.png"
        pageH={1975}
        w={960}
        h={760}
        style={{ position: "absolute", right: 90, top: 160 }}
        cam={[
          { f: 0, cx: 960, cy: 520, zoom: 0.62 },
          { f: 130, cx: 960, cy: 600, zoom: 1.0 },
        ]}
        tilt={[{ f: 0, ry: -10, rx: 6 }, { f: 130, ry: -3, rx: 2 }]}
      />
    </Paper>
  );
};

/** 13. Адаптивная вёрстка: три телефона въезжают снизу. */
export const Mobile: React.FC = () => {
  const phones = ["shots/m-landing.png", "shots/m-contests.png", "shots/m-solution.png"];
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 80 }}>
        <Kinetic text="Удобно и с телефона" size={92} align="center" />
        <div style={{ marginTop: 16 }}>
          <Lead delay={14} size={36}>
            Адаптивная вёрстка для любых устройств
          </Lead>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 56, paddingBottom: 0 }}>
        {phones.map((src, i) => (
          <Phone key={src} src={src} delay={10 + i * 8} lift={i === 1 ? 60 : 0} />
        ))}
      </AbsoluteFill>
    </Paper>
  );
};

const Phone: React.FC<{ src: string; delay: number; lift: number }> = ({ src, delay, lift }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 26], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <div
      style={{
        width: 390,
        height: 660,
        marginBottom: -120 + lift,
        borderRadius: 44,
        overflow: "hidden",
        border: `10px solid ${C.ink}`,
        background: C.panel,
        boxShadow: "0 40px 80px -40px oklch(21% 0.028 262 / 0.5)",
        transform: `translateY(${(1 - t) * 420}px)`,
      }}
    >
      <Img src={staticFile(src)} style={{ width: 370, display: "block" }} />
    </div>
  );
};

/** 14. Технологии — только то, что реально в проекте. */
export const Stack: React.FC = () => {
  const stack = ["React + TypeScript", "FastAPI, микросервисы", "PostgreSQL", "WebSocket-чат", "ЮKassa", "Ollama (LLaMA)", "Docker"];
  return (
    <Graphite field={0.6}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 56 }}>
        <Kinetic text="Под капотом" size={110} color={C.gInk} align="center" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center", maxWidth: 1400 }}>
          {stack.map((s, i) => (
            <Chip key={s} delay={14 + i * 5} dark>
              {s}
            </Chip>
          ))}
        </div>
      </AbsoluteFill>
    </Graphite>
  );
};

/** 15. Конкурентные преимущества. */
export const Advantages: React.FC = () => {
  const rows = [
    ["Много решений", "вместо одного исполнителя"],
    ["Прозрачность", "для заказчика и исполнителя"],
    ["Рейтинг и портфолио", "подтверждённые победами"],
    ["Быстрый старт", "без долгого подбора"],
  ];
  return (
    <Paper>
      <AbsoluteFill style={{ padding: "0 160px", justifyContent: "center" }}>
        {rows.map(([a, b], i) => (
          <Row key={a} a={a} b={b} delay={i * 9} />
        ))}
      </AbsoluteFill>
    </Paper>
  );
};

const Row: React.FC<{ a: string; b: string; delay: number }> = ({ a, b, delay }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 20], [0, 1], { ...clamp, easing: EASE.out });
  const line = interpolate(frame, [delay, delay + 30], [0, 1], { ...clamp, easing: EASE.inOut });
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "baseline", padding: "34px 0" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: C.rule2, transformOrigin: "left", transform: `scaleX(${line})` }} />
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 84, letterSpacing: "-0.03em", color: C.ink, opacity: t, transform: `translateX(${(1 - t) * -30}px)` }}>{a}</div>
      <div style={{ fontFamily: F.body, fontSize: 44, color: C.ink2, opacity: t }}>{b}</div>
    </div>
  );
};

/** 16. Поддержка Фонда и финальный знак. */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const fund = interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: EASE.out });
  const fundOut = interpolate(frame, [96, 112], [1, 0], { ...clamp, easing: EASE.out });
  const mark = interpolate(frame, [112, 136], [0, 1], { ...clamp, easing: EASE.out });
  return (
    <Paper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fund * fundOut }}>
        <div style={{ display: "flex", alignItems: "center", gap: 80, maxWidth: 1560, transform: `translateY(${(1 - fund) * 20}px)` }}>
          <Img src={staticFile("brand/fasie-logo.png")} style={{ width: 420, flexShrink: 0 }} />
          <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 46, lineHeight: 1.35, color: C.ink, letterSpacing: "-0.01em" }}>
            Проект реализован при поддержке Фонда содействия инновациям в рамках программы «Студенческий стартап» мероприятия «Платформа
            университетского технологического предпринимательства» федерального проекта «Технологии»
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 40, opacity: mark, transform: `scale(${0.95 + 0.05 * mark})`, filter: `blur(${(1 - mark) * 10}px)` }}
      >
        <Wordmark size={160} />
        <Mono delay={130} color={C.ink2} size={40}>
          конкурс вместо одного подрядчика
        </Mono>
      </AbsoluteFill>
    </Paper>
  );
};
