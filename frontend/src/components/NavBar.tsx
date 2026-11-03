import { useContext, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Context } from "../context";
import { observer } from "mobx-react-lite";
import { BsWallet2 } from "react-icons/bs";
import NotificationBell from "./NotificationBell";
import {
  CONTESTS_ROUTE,
  LANDING_ROUTE,
  ADMIN_ROUTE,
  LOGIN_ROUTE,
  MY_SOLUTIONS_ROUTE,
  MY_CONTESTS_ROUTE,
  CREATE_CONTEST_ROUTE,
  PROFILE_ROUTE,
  WALLET_ROUTE,
  MESSAGES_ROUTE,
  LEADERBOARD_ROUTE,
} from "../utils/consts.js";

const NavBar = observer(() => {
  const { user, payment, chat, notifications } = useContext(Context);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user.isAuth) {
      payment.fetchBalance();
    }
  }, [user.isAuth]);

  // Один WebSocket чата на пользователя: открываем после входа, закрываем при выходе.
  const myId = (user.user as { id?: number })?.id;
  useEffect(() => {
    if (user.isAuth && myId) {
      chat.connect(myId);
    } else {
      chat.disconnect();
    }
  }, [user.isAuth, myId]);

  // Центр уведомлений: опрос API + события чата, пока пользователь вошёл.
  const myRole = user.user?.role;
  useEffect(() => {
    if (user.isAuth && myId && myRole) {
      notifications.start(myId, myRole, chat);
    } else {
      notifications.stop();
    }
    return () => notifications.stop();
  }, [user.isAuth, myId, myRole]);

  const logOut = () => {
    notifications.stop();
    chat.disconnect();
    user.setUser({});
    user.setIsAuth(false);
    localStorage.removeItem("token");
    navigate(LANDING_ROUTE);
    setOpen(false);
  };

  // Пункт меню: приглушённый по умолчанию, светлый и с подложкой — активный.
  const linkClass = ({ isActive }) =>
    `h-7 px-2.5 inline-flex items-center rounded-md text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
      isActive
        ? "text-gray-100 bg-gray-700/60"
        : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
    }`;

  const links = () => {
    const role = user.user?.role;
    const top = (
      <>
        <NavLink to={CONTESTS_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
          Конкурсы
        </NavLink>
        <NavLink to={LEADERBOARD_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
          Рейтинг
        </NavLink>
      </>
    );
    if (!user.isAuth) return top;
    return (
      <>
        {top}
        <NavLink to={MESSAGES_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
          Сообщения
          {chat.unreadTotal > 0 && (
            <span
              className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white"
              aria-label={`Непрочитанных: ${chat.unreadTotal}`}
            >
              {chat.unreadTotal > 99 ? "99+" : chat.unreadTotal}
            </span>
          )}
        </NavLink>
        {role === "executor" && (
          <NavLink to={MY_SOLUTIONS_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
            Мои решения
          </NavLink>
        )}
        {role === "customer" && (
          <>
            <NavLink to={MY_CONTESTS_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
              Мои конкурсы
            </NavLink>
            <NavLink to={CREATE_CONTEST_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
              Новый конкурс
            </NavLink>
          </>
        )}
        {role === "admin" && (
          <NavLink to={ADMIN_ROUTE} className={linkClass} onClick={() => setOpen(false)}>
            Админ панель
          </NavLink>
        )}
      </>
    );
  };

  // У лендинга своя шапка; эффекты выше (чат, уведомления) продолжают работать.
  if (pathname === LANDING_ROUTE) return null;

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-700 bg-gray-950">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-5">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(LANDING_ROUTE)}
            className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight text-gray-100 transition-opacity hover:opacity-80 focus:outline-none"
            aria-label="devContest"
          >
            <img src="/logo.svg" alt="" className="h-5 w-5" />
            devContest
          </button>

          <div className="hidden items-center gap-1 lg:flex">{links()}</div>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {user.isAuth ? (
            <>
              <NotificationBell />

              <NavLink
                to={WALLET_ROUTE}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-700 px-2.5 text-[13px] text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100 focus:outline-none"
                aria-label="Кошелёк"
              >
                <BsWallet2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="tabular-nums font-medium">
                  {Number(payment.balance).toLocaleString("ru-RU")} ₽
                </span>
              </NavLink>

              <button
                onClick={() => navigate(PROFILE_ROUTE)}
                className="inline-flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-gray-100 focus:outline-none"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">
                  {user.user?.login?.[0]?.toUpperCase()}
                </span>
                {user.user?.login}
              </button>

              <button
                onClick={logOut}
                className="inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300 focus:outline-none"
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate(LOGIN_ROUTE)}
              className="lin-btn lin-btn-primary"
            >
              Войти
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
        {user.isAuth && <NotificationBell />}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100 focus:outline-none"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
        >
          <div className="flex flex-col items-center justify-center">
            <div
              className={`h-px w-4 bg-current transition-all duration-200 ${open ? "translate-y-1 rotate-45" : ""}`}
            />
            <div className={`my-1 h-px w-4 bg-current transition-all duration-200 ${open ? "opacity-0" : ""}`} />
            <div
              className={`h-px w-4 bg-current transition-all duration-200 ${open ? "-translate-y-1 -rotate-45" : ""}`}
            />
          </div>
        </button>
        </div>
      </div>

      {open && (
        <div className="animate-slide-down flex flex-col gap-1 border-t border-gray-700 bg-gray-950 px-4 py-3 lg:hidden">
          {links()}

          {user.isAuth ? (
            <>
              <NavLink
                to={WALLET_ROUTE}
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 px-2.5 text-[13px] text-gray-300"
              >
                <BsWallet2 className="h-3.5 w-3.5 text-gray-400" />
                {Number(payment.balance).toLocaleString("ru-RU")} ₽
              </NavLink>

              <button
                onClick={() => {
                  navigate(PROFILE_ROUTE);
                  setOpen(false);
                }}
                className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium text-gray-300 hover:bg-gray-800"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">
                  {user.user?.login?.[0]?.toUpperCase()}
                </span>
                {user.user?.login}
              </button>

              <button
                onClick={logOut}
                className="inline-flex h-8 items-center rounded-md px-2 text-left text-[13px] font-medium text-gray-500 hover:bg-gray-800 hover:text-gray-300"
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                navigate(LOGIN_ROUTE);
                setOpen(false);
              }}
              className="lin-btn lin-btn-primary mt-1"
            >
              Войти
            </button>
          )}
        </div>
      )}
    </nav>
  );
});

export default NavBar;
