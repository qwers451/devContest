import { useContext } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
  BsArrowRight,
  BsBell,
  BsBriefcase,
  BsChatDots,
  BsCodeSlash,
  BsRobot,
  BsShieldCheck,
  BsStarFill,
  BsTrophy,
} from "react-icons/bs";
import { Context } from "../context";
import { CONTESTS_ROUTE, LEADERBOARD_ROUTE, REGISTRATION_ROUTE } from "../utils/consts.js";
import { FASIE_SUPPORT_TEXT } from "./AboutPage";

// Стартовая страница: описание продукта для тех, кто пришёл впервые.
// Рабочая часть платформы начинается со списка конкурсов (CONTESTS_ROUTE).

const features = [
  {
    icon: BsTrophy,
    title: "Конкурсы с призовыми местами",
    text: "Заказчик публикует ТЗ, бюджет и распределение призов. Платит только за лучшие решения.",
  },
  {
    icon: BsRobot,
    title: "ИИ-проверка по ТЗ",
    text: "Каждое решение автоматически сверяется с требованиями — заказчик сразу видит, что выполнено.",
  },
  {
    icon: BsShieldCheck,
    title: "Кошелёк и эскроу",
    text: "Призовой фонд резервируется при запуске конкурса и выплачивается победителям после итогов.",
  },
  {
    icon: BsStarFill,
    title: "Рейтинг исполнителей",
    text: "Отзывы, оценки ИИ и призовые места складываются в публичный рейтинг и портфолио.",
  },
  {
    icon: BsChatDots,
    title: "Чат и обсуждения",
    text: "Личные сообщения и обсуждение под каждым конкурсом — вопросы по ТЗ решаются в одном месте.",
  },
  {
    icon: BsBell,
    title: "Уведомления",
    text: "Новые решения, дедлайны и итоги конкурсов приходят в центр уведомлений в реальном времени.",
  },
];

const steps = [
  { title: "Опишите задачу", text: "Заказчик создаёт конкурс: ТЗ, сроки, призовой фонд и места." },
  { title: "Получите решения", text: "Исполнители присылают работы, ИИ оценивает соответствие требованиям." },
  { title: "Выберите лучших", text: "Заказчик выбирает победителей, призы уходят им на кошельки." },
];

const audiences = [
  {
    icon: BsBriefcase,
    title: "Заказчикам",
    points: [
      "Несколько вариантов решения вместо одного",
      "Оплата только за результат",
      "Автоматическая первичная проверка по ТЗ",
    ],
  },
  {
    icon: BsCodeSlash,
    title: "Исполнителям",
    points: [
      "Реальные задачи и прозрачные призы",
      "Рейтинг и портфолио из выигранных конкурсов",
      "Гарантированная выплата через эскроу",
    ],
  },
];

const mockSolutions = [
  { login: "kate_dev", score: 94, place: "🥇" },
  { login: "a.petrov", score: 88, place: "🥈" },
  { login: "neo_front", score: 81, place: "🥉" },
];

const HeroMock = () => (
  <div className="relative">
    <div className="absolute -inset-6 rounded-3xl bg-violet-600/20 blur-3xl" aria-hidden />
    <div className="relative rounded-xl border border-gray-700 bg-gray-900/90 p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Конкурс · Веб-разработка</div>
          <div className="mt-1 text-[15px] font-semibold text-gray-100">Лендинг для IT-конференции</div>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
          Идёт
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["120 000 ₽", "призовой фонд"],
          ["14", "решений"],
          ["2 д 6 ч", "до финиша"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-2">
            <div className="text-[14px] font-semibold tabular-nums text-gray-100">{v}</div>
            <div className="text-[11px] text-gray-500">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {mockSolutions.map((s) => (
          <div key={s.login} className="flex items-center gap-3 rounded-lg bg-gray-800/60 px-3 py-2">
            <span className="text-[16px]" aria-hidden>
              {s.place}
            </span>
            <span className="w-24 truncate text-[13px] text-gray-200">{s.login}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-700">
              <div className="h-full rounded-full bg-violet-500" style={{ width: `${s.score}%` }} />
            </div>
            <span className="w-14 text-right text-[12px] tabular-nums text-gray-400">ИИ {s.score}%</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const LandingPage = () => {
  const { user } = useContext(Context)!;

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-950 text-gray-100">
      {/* Hero */}
      <section className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(94,106,210,0.25),transparent_60%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:pt-20 lg:grid-cols-2">
          <div className="animate-fade-in">
            <a
              href="#support"
              className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-[12px] text-gray-300 transition-colors hover:border-gray-600"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              При поддержке Фонда содействия инновациям
            </a>
            <h1 className="mt-5 text-[36px] font-semibold leading-[1.1] tracking-tight sm:text-[48px]">
              Конкурсный фриланс
              <br />
              <span className="bg-gradient-to-r from-violet-300 to-violet-500 bg-clip-text text-transparent">
                для разработчиков
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-gray-400">
              devContest соединяет заказчиков и исполнителей через конкурсы: вы публикуете задачу, получаете
              несколько готовых решений с ИИ-проверкой по ТЗ и платите только за лучшие.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={CONTESTS_ROUTE}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-violet-600 px-5 text-[14px] font-medium text-white transition-colors hover:bg-violet-500"
              >
                Смотреть конкурсы <BsArrowRight />
              </Link>
              {user.isAuth ? (
                <Link
                  to={LEADERBOARD_ROUTE}
                  className="inline-flex h-11 items-center rounded-md border border-gray-700 px-5 text-[14px] font-medium text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-900"
                >
                  Рейтинг исполнителей
                </Link>
              ) : (
                <Link
                  to={REGISTRATION_ROUTE}
                  className="inline-flex h-11 items-center rounded-md border border-gray-700 px-5 text-[14px] font-medium text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-900"
                >
                  Создать аккаунт
                </Link>
              )}
            </div>
          </div>
          <div className="animate-fade-in [animation-delay:120ms]">
            <HeroMock />
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section className="border-t border-gray-700/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Как это работает</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-lg border border-gray-700 bg-gray-900 p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/20 text-[13px] font-semibold text-violet-300">
                  {i + 1}
                </div>
                <div className="mt-4 text-[15px] font-semibold">{s.title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-400">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section className="border-t border-gray-700/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Всё для конкурса в одном месте</h2>
          <p className="mt-2 max-w-2xl text-[14px] text-gray-400">
            От публикации ТЗ до выплаты призов — без сторонних сервисов и ручных переводов.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="rounded-lg border border-gray-700 bg-gray-900 p-5 transition-colors hover:border-gray-600"
              >
                <Icon className="h-5 w-5 text-violet-400" />
                <div className="mt-3 text-[15px] font-semibold">{title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Для кого */}
      <section className="border-t border-gray-700/60">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-2">
          {audiences.map(({ icon: Icon, title, points }) => (
            <div key={title} className="rounded-lg border border-gray-700 bg-gray-900 p-6">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-violet-400" />
                <h3 className="text-[18px] font-semibold">{title}</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 text-[14px] text-gray-300">
                    <span className="text-violet-400">—</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Поддержка Фонда: логотип по требованию Фонда не является ссылкой */}
      <section id="support" className="scroll-mt-16 border-t border-gray-700/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-col items-center gap-8 rounded-xl border border-gray-700 bg-gray-900 p-8 text-center sm:flex-row sm:text-left">
            <img
              src="/fasie-logo-white.png"
              alt="Логотип Фонда содействия инновациям"
              className="h-auto w-52 shrink-0 select-none"
              draggable={false}
            />
            <p className="text-[15px] leading-relaxed text-gray-200">{FASIE_SUPPORT_TEXT}</p>
          </div>
        </div>
      </section>

      {/* Финальный призыв */}
      <section className="border-t border-gray-700/60">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Готовы начать?</h2>
          <p className="mx-auto mt-2 max-w-xl text-[14px] text-gray-400">
            Посмотрите открытые конкурсы или опубликуйте свою задачу.
          </p>
          <Link
            to={CONTESTS_ROUTE}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-violet-600 px-6 text-[14px] font-medium text-white transition-colors hover:bg-violet-500"
          >
            Перейти к конкурсам <BsArrowRight />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default observer(LandingPage);
