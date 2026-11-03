import { useContext, useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import {
  ABOUT_ROUTE,
  CONTESTS_ROUTE,
  LANDING_ROUTE,
  LEADERBOARD_ROUTE,
  LOGIN_ROUTE,
  REGISTRATION_ROUTE,
} from "../utils/consts.js";
import { FASIE_SUPPORT_TEXT } from "./AboutPage";
import AsciiField from "./landing/AsciiField";
import "./landing/landing.css";

// Стартовая страница: описание продукта для тех, кто пришёл впервые.
// Свои шапка и подвал (общие NavBar и Footer на этом маршруте скрыты),
// стили изолированы в .hm, чтобы не задевать тёмную тему приложения.

const path = [
  {
    title: "ТЗ",
    text: "Заказчик описывает задачу, срок и делит призовой фонд по местам.",
    value: "места: 60 / 30 / 10 %",
  },
  {
    title: "Резерв фонда",
    text: "Конкурс открывается, только когда призовой фонд зарезервирован.",
    value: "escrow: held",
  },
  {
    title: "Решения",
    text: "Исполнители присылают работы до дедлайна и задают вопросы в обсуждении.",
    value: "status: active",
  },
  {
    title: "Анализ ИИ",
    text: "Требования извлекаются из ТЗ, каждое решение сверяется с ними.",
    value: "критерии ← ТЗ",
    key: true,
  },
  {
    title: "Выплата",
    text: "Заказчик выбирает победителей, призы уходят на их кошельки.",
    value: "release-award",
  },
];

const prizes = [
  { place: "1", share: "60%", prize: "108 000 ₽", net: "97 200 ₽" },
  { place: "2", share: "30%", prize: "54 000 ₽", net: "48 600 ₽" },
  { place: "3", share: "10%", prize: "18 000 ₽", net: "16 200 ₽" },
];

const questions = [
  {
    q: "Кто может создать конкурс?",
    a: "Любой пользователь с ролью организатора. Роль выбирается при регистрации.",
  },
  {
    q: "Как ИИ проверяет решение?",
    a: "Из текста ТЗ извлекаются критерии. Каждое решение получает оценку по ним, а заказчик видит отчёт с баллом и нарушениями.",
  },
  {
    q: "Когда исполнитель получает деньги?",
    a: "Сразу после того, как заказчик подвёл итоги: приз переводится из резерва на кошелёк победителя.",
  },
  {
    q: "Можно ли уточнить задачу у заказчика?",
    a: "Да. У каждого конкурса есть обсуждение, а с заказчиком можно переписываться в личных сообщениях.",
  },
];

const LandingPage = () => {
  const { user } = useContext(Context)!;
  const mapRef = useRef<HTMLElement>(null);

  // Соединители карты прорисовываются один раз, когда карта входит в экран.
  // Взводим анимацию только если карта ещё ниже экрана: без JS и при reduced motion линии видны сразу.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (map.getBoundingClientRect().top < window.innerHeight * 0.8) return;
    map.classList.add("is-armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        map.classList.add("is-drawn");
        io.disconnect();
      },
      { rootMargin: "0px 0px -25% 0px" },
    );
    io.observe(map);
    return () => io.disconnect();
  }, []);

  const secondary = user.isAuth
    ? { to: LEADERBOARD_ROUTE, label: "Рейтинг исполнителей" }
    : { to: REGISTRATION_ROUTE, label: "Создать аккаунт" };

  return (
    <div className="hm" data-theme="cobalt">
      <header className="hm-nav">
        <div className="container">
          <Link to={LANDING_ROUTE} className="hm-wordmark">
            <img src="/logo.svg" alt="" width="22" height="22" />
            devContest
          </Link>
          <nav className="hm-nav__links" aria-label="Основная навигация">
            <Link to={LEADERBOARD_ROUTE} className="textlink">
              Рейтинг
            </Link>
            <a href="#support" className="textlink">
              Поддержка Фонда
            </a>
            {user.isAuth ? (
              <Link to={CONTESTS_ROUTE} className="key key--small">
                К конкурсам
              </Link>
            ) : (
              <Link to={LOGIN_ROUTE} className="key key--small">
                Войти
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="hm-hero">
          <AsciiField />
          <div className="container hm-hero__grid">
            <div className="hm-hero__text">
              <h1>Конкурс вместо одного подрядчика</h1>
              <p className="lead">
                Опубликуйте ТЗ с призовым фондом и получите несколько решений, проверенных ИИ.
              </p>
              <div className="hm-hero__actions">
                <Link to={CONTESTS_ROUTE} className="key key--primary">
                  Смотреть конкурсы
                </Link>
                <Link to={secondary.to} className="key">
                  {secondary.label}
                </Link>
              </div>
              <p className="hm-hero__terms">Комиссия платформы 10%, удерживается из выплаты победителю.</p>
            </div>
            <figure className="shot">
              <div className="shot__frame" data-slot="hero" data-kind="product">
                <img
                  src="/landing/screen-contest-ai-desktop.png"
                  width="1732"
                  height="1312"
                  alt="Вкладка «Анализ ИИ» конкурса: два решения оценены, средний балл 83%, четыре критерия из ТЗ"
                  fetchPriority="high"
                />
              </div>
              <figcaption>Анализ ИИ на странице конкурса: критерии извлечены из ТЗ.</figcaption>
            </figure>
          </div>
        </section>

        <section ref={mapRef} className="hm-map" aria-labelledby="map-title">
          <div className="container">
            <div className="hm-head">
              <h2 id="map-title">Один путь от ТЗ до выплаты</h2>
              <p className="lead">Деньги заказчика лежат в резерве, пока он не выберет победителей.</p>
            </div>
            <ol className="hm-map__path" aria-label="Путь конкурса">
              {path.map((n, i) => (
                <li
                  key={n.title}
                  className={n.key ? "hm-node hm-node--key" : "hm-node"}
                  style={{ "--i": i } as CSSProperties}
                >
                  <h3>{n.title}</h3>
                  <p>{n.text}</p>
                  <span className="mono">{n.value}</span>
                </li>
              ))}
            </ol>
            <div className="hm-map__aside">
              <div className="hm-branch hm-branch--stages">
                <h3>Этапы</h3>
                <p>Большую задачу можно разбить на этапы, каждый оплачивается из резерва отдельно.</p>
              </div>
              <div className="hm-branch hm-branch--rating">
                <h3>Рейтинг</h3>
                <p>Места, отзывы заказчиков и оценки ИИ складываются в публичный рейтинг исполнителя.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="hm-showcase" aria-labelledby="list-title">
          <div className="container">
            <div className="hm-head">
              <h2 id="list-title">Открытые задачи с призом и сроком</h2>
              <p className="lead">Фильтры по типу, статусу, призовому фонду и дедлайну.</p>
            </div>
            <figure className="shot">
              <div className="shot__frame" data-slot="contests" data-kind="product">
                <img
                  src="/landing/screen-contests-desktop.png"
                  width="2880"
                  height="1800"
                  loading="lazy"
                  alt="Список конкурсов: фильтры слева, карточки с призовым фондом, типом и сроком справа"
                />
              </div>
            </figure>
          </div>
        </section>

        <section className="hm-band" aria-labelledby="prize-title">
          <div className="container hm-split">
            <div className="hm-split__text">
              <h2 id="prize-title">Фонд делится по местам</h2>
              <p className="lead">Доли задаёт заказчик. Сумму на руки видно ещё до старта.</p>
            </div>
            <figure className="hm-table__wrap">
              <table className="hm-table">
                <thead>
                  <tr>
                    <th scope="col">Место</th>
                    <th scope="col">Доля</th>
                    <th scope="col" className="r">
                      Приз
                    </th>
                    <th scope="col" className="r">
                      На руки
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {prizes.map((p) => (
                    <tr key={p.place}>
                      <td>{p.place}</td>
                      <td>{p.share}</td>
                      <td className="r mono">{p.prize}</td>
                      <td className="r mono">{p.net}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <figcaption>Пример: конкурс «Личный кабинет для страхового брокера» с фондом 180 000 ₽.</figcaption>
            </figure>
          </div>
        </section>

        <section className="hm-rating" aria-labelledby="rating-title">
          <div className="container hm-split">
            <figure className="shot">
              <div className="shot__frame" data-slot="rating" data-kind="product">
                <img
                  src="/landing/screen-top-desktop.png"
                  width="1796"
                  height="906"
                  loading="lazy"
                  alt="Рейтинг исполнителей: место, уровень, число побед и сумма выплат"
                />
              </div>
            </figure>
            <div className="hm-split__text">
              <h2 id="rating-title">Репутация, собранная из побед</h2>
              <p className="lead">Победы, отзывы и оценки ИИ видны каждому заказчику.</p>
              <div>
                <Link to={LEADERBOARD_ROUTE} className="textlink">
                  Открыть рейтинг
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="hm-faq" aria-labelledby="faq-title">
          <div className="container hm-split">
            <h2 id="faq-title">Частые вопросы</h2>
            <dl className="hm-rows">
              {questions.map(({ q, a }) => (
                <div key={q}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="support" className="hm-support" aria-label="Поддержка Фонда содействия инновациям">
          <div className="container hm-support__grid">
            <img
              src="/fasie-logo.png"
              alt="Логотип Фонда содействия инновациям"
              className="hm-support__logo"
              width="376"
              height="211"
              draggable={false}
            />
            <p className="hm-support__text">{FASIE_SUPPORT_TEXT}</p>
          </div>
        </section>

        <section className="hm-close" aria-labelledby="close-title">
          <div className="container">
            <h2 id="close-title">Выберите задачу или опубликуйте свою</h2>
            <div className="hm-close__actions">
              <Link to={CONTESTS_ROUTE} className="key key--primary">
                Смотреть конкурсы
              </Link>
              <Link to={secondary.to} className="key">
                {secondary.label}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="hm-footer">
        <div className="container">
          <div className="hm-footer__grid">
            <div className="hm-footer__sign">
              <Link to={LANDING_ROUTE} className="hm-wordmark">
                devContest
              </Link>
              <p>Конкурсная платформа для разработчиков и заказчиков.</p>
            </div>
            <nav aria-label="Ссылки в подвале">
              <Link to={CONTESTS_ROUTE} className="textlink">
                Конкурсы
              </Link>
              <Link to={LEADERBOARD_ROUTE} className="textlink">
                Рейтинг
              </Link>
              <Link to={ABOUT_ROUTE} className="textlink">
                О проекте
              </Link>
            </nav>
          </div>
          <p className="hm-footer__legal">© {new Date().getFullYear()} devContest</p>
        </div>
      </footer>
    </div>
  );
};

export default observer(LandingPage);
