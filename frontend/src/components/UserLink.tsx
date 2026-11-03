import React from "react";
import { Link } from "react-router-dom";
import { PUBLIC_PROFILE_ROUTE } from "../utils/consts.js";

interface Props {
  id?: number | null;
  login?: string | null;
  /** Показывать «@» перед логином. */
  at?: boolean;
  className?: string;
  fallback?: string;
}

/** Логин пользователя со ссылкой на публичный профиль. Безопасен внутри кликабельных карточек. */
const UserLink = ({ id, login, at = true, className = "", fallback = "Неизвестно" }: Props) => {
  const text = login ? `${at ? "@" : ""}${login}` : fallback;
  if (!id || !login) return <span className={className}>{text}</span>;
  return (
    <Link
      to={`${PUBLIC_PROFILE_ROUTE}/${id}`}
      onClick={(e) => e.stopPropagation()}
      className={`hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 rounded ${className}`}
    >
      {text}
    </Link>
  );
};

export default UserLink;
