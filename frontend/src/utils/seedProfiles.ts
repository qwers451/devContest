import type { ProfileExtras } from "./profileExtras";

/**
 * Профили по умолчанию для тестовых пользователей (seed). Используются, только пока
 * в localStorage ничего не сохранено: правки пользователя имеют приоритет.
 */
export const SEED_EXTRAS: Record<string, Partial<ProfileExtras>> = {
  customer1: {
    about:
      "Продуктовая компания, делаем сервисы для малого бизнеса. Заказываем интерфейсы, API и интеграции, чётко формулируем ТЗ и быстро принимаем работу.",
    skills: ["Продукт", "B2B", "Интеграции", "Дизайн-системы"],
    link: "https://example-studio.dev",
    avatarColor: "#7c3aed",
  },
  executor1: {
    about:
      "Backend-разработчик, 7 лет на Python. Проектирую REST API, микросервисы и интеграции с платёжными системами. Люблю тесты и понятные README.",
    skills: ["Python", "FastAPI", "PostgreSQL", "Docker", "Redis"],
    link: "https://github.com/executor1",
    avatarColor: "#2563eb",
  },
  executor2: {
    about:
      "Фронтенд-разработчик: React, TypeScript, адаптивная вёрстка. Делаю аккуратные интерфейсы с упором на доступность и скорость загрузки.",
    skills: ["React", "TypeScript", "Tailwind", "Vite", "Vitest", "Figma"],
    link: "https://github.com/executor2",
    avatarColor: "#db2777",
  },
  executor3: {
    about:
      "Full-stack разработчик и немного дизайнер. Беру задачи от прототипа до релиза: Node.js, мобильные клиенты и аналитика данных.",
    skills: ["Node.js", "React Native", "SQL", "Аналитика"],
    link: "https://github.com/executor3",
    avatarColor: "#059669",
  },
};
