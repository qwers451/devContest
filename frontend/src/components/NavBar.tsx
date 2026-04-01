import React, { useContext, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Context } from "../context";
import { observer } from "mobx-react-lite";
import { BsSun, BsMoon, BsWallet2 } from "react-icons/bs";
import {
  CONTESTS_ROUTE,
  ADMIN_ROUTE,
  LOGIN_ROUTE,
  MY_SOLUTIONS_ROUTE,
  MY_CONTESTS_ROUTE,
  CREATE_CONTEST_ROUTE,
  PROFILE_ROUTE,
  WALLET_ROUTE,
} from "../utils/consts.js";

const NavBar = observer(() => {
  const { user, payment } = useContext(Context);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const desktopThemeButtonRef = useRef(null);
  const mobileThemeButtonRef = useRef(null);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (user.isAuth) {
      payment.fetchBalance();
    }
  }, [user.isAuth]);

  const applyTheme = React.useCallback((nextIsDark) => {
    if (nextIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, []);

  const toggleTheme = React.useCallback(
    async (event) => {
      const nextIsDark = !isDark;
      const target =
        event?.currentTarget ||
        desktopThemeButtonRef.current ||
        mobileThemeButtonRef.current;
      const root = document.documentElement;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (!target || !document.startViewTransition || reduceMotion) {
        applyTheme(nextIsDark);
        setIsDark(nextIsDark);
        return;
      }

      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      root.style.setProperty("--theme-transition-x", `${x}px`);
      root.style.setProperty("--theme-transition-y", `${y}px`);

      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      root.style.setProperty("--theme-transition-radius", `${maxRadius}px`);

      const transition = document.startViewTransition(() => {
        applyTheme(nextIsDark);
        setIsDark(nextIsDark);
      });

      try {
        await transition.finished;
      } finally {
        root.style.removeProperty("--theme-transition-x");
        root.style.removeProperty("--theme-transition-y");
        root.style.removeProperty("--theme-transition-radius");
      }
    },
    [applyTheme, isDark],
  );

  const logOut = () => {
    user.setUser({});
    user.setIsAuth(false);
    localStorage.removeItem("token");
    navigate(CONTESTS_ROUTE);
    setOpen(false);
  };

  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none rounded-xl px-3 py-2.5 md:px-1 md:py-0.5 md:rounded md:block ${isActive ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/40 md:bg-transparent md:text-violet-600 md:dark:text-violet-400" : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 md:hover:bg-transparent md:text-gray-600 md:hover:text-violet-600 md:dark:text-gray-300 md:dark:hover:text-violet-400"}`;

  const links = () => {
    if (!user.isAuth) return null;
    const role = user.user?.role;
    return (
      <>
        <NavLink
          to={CONTESTS_ROUTE}
          className={linkClass}
          onClick={() => setOpen(false)}
        >
          Конкурсы
        </NavLink>
        {role === "executor" && (
          <NavLink
            to={MY_SOLUTIONS_ROUTE}
            className={linkClass}
            onClick={() => setOpen(false)}
          >
            Мои решения
          </NavLink>
        )}
        {role === "customer" && (
          <>
            <NavLink
              to={MY_CONTESTS_ROUTE}
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              Мои конкурсы
            </NavLink>
            <NavLink
              to={CREATE_CONTEST_ROUTE}
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              Добавить конкурс
            </NavLink>
          </>
        )}
        {role === "admin" && (
          <NavLink
            to={ADMIN_ROUTE}
            className={linkClass}
            onClick={() => setOpen(false)}
          >
            Админ панель
          </NavLink>
        )}
      </>
    );
  };

  return (
    <nav className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => navigate(CONTESTS_ROUTE)}
          className="flex items-center gap-2 font-black text-lg tracking-tight text-gray-900 dark:text-white hover:text-violet-700 dark:hover:text-violet-400 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none rounded"
          aria-label="На главную"
        >
          <img src="/logo.svg" alt="logo" className="w-7 h-7" />
          devContest
        </button>

        <div className="hidden md:flex items-center gap-6">{links()}</div>

        <div className="hidden md:flex items-center gap-3">
          <button
            ref={desktopThemeButtonRef}
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none"
            aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
            title={isDark ? "Светлая тема" : "Тёмная тема"}
          >
            {isDark ? <BsSun size={16} /> : <BsMoon size={16} />}
          </button>
          {user.isAuth ? (
            <>
              <NavLink
                to={WALLET_ROUTE}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors group focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none"
                aria-label="Кошелёк"
                title="Кошелёк"
              >
                <BsWallet2 className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                <span className="text-sm font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                  {Number(payment.balance).toLocaleString("ru-RU")} ₽
                </span>
              </NavLink>
              <button
                onClick={() => navigate(PROFILE_ROUTE)}
                className="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-violet-600 dark:hover:text-violet-400 transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none rounded"
              >
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xs font-black">
                  {user.user?.login?.[0]?.toUpperCase()}
                </span>
                {user.user?.login}
              </button>
              <button
                onClick={logOut}
                className="px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-medium focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none"
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate(LOGIN_ROUTE)}
              className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none"
            >
              Войти
            </button>
          )}
        </div>

        <button
          className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus:outline-none"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
        >
          <div className="flex flex-col justify-center items-center">
            <div
              className={`w-5 h-0.5 bg-current transition-all duration-200 ${open ? "rotate-45 translate-y-1.5" : ""}`}
            />
            <div
              className={`w-5 h-0.5 bg-current my-1 transition-all duration-200 ${open ? "opacity-0" : ""}`}
            />
            <div
              className={`w-5 h-0.5 bg-current transition-all duration-200 ${open ? "-rotate-45 -translate-y-1.5" : ""}`}
            />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 animate-slide-down px-4 py-4 flex flex-col gap-2 shadow-lg">
          <div className="flex flex-col gap-1 mb-2">
            {links()}
          </div>
          {user.isAuth && (
            <NavLink
              to={WALLET_ROUTE}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300 px-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <BsWallet2 className="w-4 h-4" />
              {Number(payment.balance).toLocaleString("ru-RU")} ₽
            </NavLink>
          )}
          <button
            ref={mobileThemeButtonRef}
            onClick={toggleTheme}
            className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200 text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {isDark ? <BsSun size={18} className="text-gray-500 dark:text-gray-400" /> : <BsMoon size={18} className="text-gray-500 dark:text-gray-400" />}
            {isDark ? "Светлая тема" : "Тёмная тема"}
          </button>
          {user.isAuth ? (
            <>
              <button
                onClick={() => {
                  navigate(PROFILE_ROUTE);
                  setOpen(false);
                }}
                className="text-sm font-medium text-gray-700 dark:text-gray-200 text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 flex items-center gap-2"
              >
                <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xs font-black">
                  {user.user?.login?.[0]?.toUpperCase()}
                </span>
                {user.user?.login}
              </button>
              <button
                onClick={logOut}
                className="text-sm font-medium text-red-600 dark:text-red-400 text-left px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 mt-2 border border-red-100 dark:border-red-900/30 text-center flex justify-center"
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
              className="text-sm text-white bg-violet-600 hover:bg-violet-700 font-semibold text-center px-4 py-3 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 mt-2"
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
