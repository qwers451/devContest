/**
 * Дополнительные поля профиля («О себе», навыки, ссылка, цвет/фото аватара).
 * Бэкенд их не хранит, поэтому лежат в localStorage по id пользователя
 * и показываются на публичном профиле в этом браузере.
 */
import { DEMO } from "../services/demoData";
import { SEED_EXTRAS } from "./seedProfiles";

export interface ProfileExtras {
  about: string;
  skills: string[];
  link: string;
  avatarColor: string;
  /** data URL загруженной картинки либо пустая строка. */
  avatarImage: string;
}

export const AVATAR_COLORS = [
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#db2777",
  "#4b5563",
];

export const EMPTY_EXTRAS: ProfileExtras = {
  about: "",
  skills: [],
  link: "",
  avatarColor: AVATAR_COLORS[0],
  avatarImage: "",
};

const key = (userId: number) => `devcontest:profile:${userId}`;

/** Заготовки для демо-режима (id совпадают с demoData). */
const DEMO_EXTRAS: Record<number, Partial<ProfileExtras>> = {
  1: {
    about: "Студия продуктовой разработки. Заказываем интерфейсы и мобильные приложения, всегда на связи и быстро принимаем работу.",
    skills: ["Продукт", "Дизайн-системы", "B2B"],
    avatarColor: "#7c3aed",
  },
  2: {
    about: "Фронтенд-разработчик, 6 лет в вебе. Люблю аккуратные интерфейсы, доступность и тесты. Беру задачи на React и TypeScript.",
    skills: ["React", "TypeScript", "Next.js", "Tailwind", "Vitest"],
    link: "https://github.com/kate-dev",
    avatarColor: "#db2777",
  },
  3: {
    about: "Full-stack: серверный рендеринг, API и интеграции. Предпочитаю понятные ТЗ и короткие итерации.",
    skills: ["Node.js", "Next.js", "PostgreSQL", "Docker"],
    link: "https://github.com/n-frolov",
    avatarColor: "#2563eb",
  },
  4: {
    about: "Лаборатория по разработке маркетплейсов и внутренних систем. Проводим конкурсы на сложные витрины и дашборды.",
    skills: ["Маркетплейсы", "Каталоги", "Аналитика"],
    avatarColor: "#059669",
  },
  5: {
    about: "Мобильный разработчик: React Native, Expo, нативные модули. Делаю приложения от прототипа до релиза в сторах.",
    skills: ["React Native", "Expo", "iOS", "Android"],
    link: "https://github.com/m-zaytsev",
    avatarColor: "#d97706",
  },
};

export function loadExtras(userId: number, login?: string | null): ProfileExtras {
  let stored: Partial<ProfileExtras> | null = null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw) stored = JSON.parse(raw) as Partial<ProfileExtras>;
  } catch {
    stored = null;
  }
  const seed = stored ? undefined : (DEMO ? DEMO_EXTRAS[userId] : undefined) ?? (login ? SEED_EXTRAS[login] : undefined);
  const src = stored ?? seed ?? {};
  return {
    about: typeof src.about === "string" ? src.about : "",
    skills: Array.isArray(src.skills) ? src.skills.filter((s) => typeof s === "string" && s.trim()) : [],
    link: typeof src.link === "string" ? src.link : "",
    avatarColor:
      typeof src.avatarColor === "string" && src.avatarColor ? src.avatarColor : EMPTY_EXTRAS.avatarColor,
    avatarImage: typeof src.avatarImage === "string" ? src.avatarImage : "",
  };
}

/** Возвращает false, если сохранить не удалось (нет места / запрещено хранилище). */
export function saveExtras(userId: number, extras: ProfileExtras): boolean {
  try {
    localStorage.setItem(key(userId), JSON.stringify(extras));
    return true;
  } catch {
    return false;
  }
}

export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((s) => {
      const k = s.toLowerCase();
      if (!seen.has(k) && out.length < 12) {
        seen.add(k);
        out.push(s.slice(0, 24));
      }
    });
  return out;
}

/** Допускает только http(s)-ссылки; для остального возвращает null. */
export function safeLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function initials(login: string | undefined | null): string {
  return (login?.trim()?.[0] ?? "?").toUpperCase();
}
