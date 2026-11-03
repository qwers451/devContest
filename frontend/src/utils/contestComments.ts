/** Обсуждение конкурса: хранится в localStorage по ключу конкурса (только фронтенд). */

export interface ContestComment {
  id: string;
  parentId: string | null;
  authorId: number | null;
  authorLogin: string;
  isCustomer: boolean;
  text: string;
  createdAt: string;
}

const key = (contestId: number | string) => `devcontest.discussion.${contestId}`;

function isComment(c: unknown): c is ContestComment {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.authorLogin === "string" &&
    typeof o.createdAt === "string"
  );
}

export function loadComments(contestId: number | string): ContestComment[] {
  try {
    const raw = localStorage.getItem(key(contestId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isComment).map((c) => ({ ...c, parentId: c.parentId ?? null }))
      : [];
  } catch {
    return [];
  }
}

export function saveComments(contestId: number | string, list: ContestComment[]): void {
  try {
    localStorage.setItem(key(contestId), JSON.stringify(list));
  } catch {
    /* хранилище недоступно — обсуждение живёт до перезагрузки */
  }
}

export interface NewComment {
  parentId?: string | null;
  authorId: number | null;
  authorLogin: string;
  isCustomer: boolean;
  text: string;
}

/** Добавляет комментарий (или ответ). Пустой текст и ответ на несуществующий комментарий игнорируются. */
export function addComment(list: ContestComment[], input: NewComment, now: Date = new Date()): ContestComment[] {
  const text = input.text.trim();
  if (!text) return list;
  let parentId = input.parentId ?? null;
  if (parentId) {
    const parent = list.find((c) => c.id === parentId);
    if (!parent) return list;
    // один уровень вложенности: ответ на ответ крепится к корневому комментарию
    parentId = parent.parentId ?? parent.id;
  }
  const comment: ContestComment = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    parentId,
    authorId: input.authorId,
    authorLogin: input.authorLogin,
    isCustomer: input.isCustomer,
    text,
    createdAt: now.toISOString(),
  };
  return [...list, comment];
}

/** Корневые комментарии по порядку и ответы к ним. */
export function threadOf(list: ContestComment[]): { root: ContestComment; replies: ContestComment[] }[] {
  const byTime = (a: ContestComment, b: ContestComment) => a.createdAt.localeCompare(b.createdAt);
  return list
    .filter((c) => !c.parentId)
    .sort(byTime)
    .map((root) => ({ root, replies: list.filter((c) => c.parentId === root.id).sort(byTime) }));
}

/** Демонстрационные комментарии для первого открытия конкурса в демо-режиме. */
export function demoSeed(customerId: number, customerLogin: string): ContestComment[] {
  const t = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString();
  return [
    {
      id: "seed-1",
      parentId: null,
      authorId: 2,
      authorLogin: "executor1",
      isCustomer: false,
      text: "Подскажите, нужна ли интеграция с существующим API или достаточно моков?",
      createdAt: t(300),
    },
    {
      id: "seed-2",
      parentId: "seed-1",
      authorId: customerId,
      authorLogin: customerLogin,
      isCustomer: true,
      text: "Достаточно моков, но структуру запросов лучше сделать так, чтобы потом подключить реальный API.",
      createdAt: t(240),
    },
    {
      id: "seed-3",
      parentId: null,
      authorId: 3,
      authorLogin: "executor2",
      isCustomer: false,
      text: "Можно ли использовать готовую UI-библиотеку?",
      createdAt: t(90),
    },
  ];
}
