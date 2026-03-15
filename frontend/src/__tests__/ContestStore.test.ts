/**
 * Vitest unit tests for ContestStore
 * Covers scenarios 6–21 (contest list, filters, management)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as api from "../services/apiService";
import ContestStore from "../store/ContestStore";

const CONTEST = {
  id: 1,
  number: 1,
  customer_id: 10,
  title: "Test Contest",
  annotation: "Ann",
  description: "Desc",
  tz_text: "TZ",
  prizepool: 5000,
  status: "active",
  type_id: 2,
  files: [],
  created_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  current_stage_id: null,
  stages: [
    { id: 11, name: "Этап 1", order: 1, deadline: null },
    { id: 12, name: "Этап 2", order: 2, deadline: null },
  ],
  winner: null,
};

const PAGINATED = { items: [CONTEST], total: 1, page: 1, pages: 1 };

let store: ContestStore;

beforeEach(() => {
  store = new ContestStore();
  vi.clearAllMocks();
});

// ── 6. Список конкурсов ───────────────────────────────────────────────────────

describe("Сценарий 6: список конкурсов", () => {
  it("fetchContestsFiltered сохраняет contests в store", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    await store.fetchContestsFiltered();
    expect(api.fetchData).toHaveBeenCalledWith("/contests", expect.any(Object));
    expect(store.contests).toHaveLength(1);
    expect(store.contests[0].id).toBe(1);
  });

  it("при ошибке API contests остаётся пустым", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Network error"));
    await store.fetchContestsFiltered();
    expect(store.contests).toHaveLength(0);
  });
});

// ── 7. Фильтр по статусу ─────────────────────────────────────────────────────

describe("Сценарий 7: фильтр по статусу", () => {
  it("setSelectedStatuses сохраняет значения", () => {
    store.setSelectedStatuses(["active", "draft"]);
    expect(store.selectedStatuses).toEqual(["active", "draft"]);
  });

  it("fetchContestsFiltered передаёт несколько statuses в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSelectedStatuses(["active", "draft"]);
    await store.fetchContestsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.statuses).toBe("active,draft");
  });
});

// ── 8. Фильтр по типу конкурса ────────────────────────────────────────────────

describe("Сценарий 8: фильтр по типу", () => {
  it("fetchContestsFiltered передаёт несколько types в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSelectedTypes([
      { id: 2, name: "Логотип" },
      { id: 3, name: "Баннер" },
    ]);
    await store.fetchContestsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.types).toBe("2,3");
  });
});

// ── 9. Фильтр по призовому фонду ─────────────────────────────────────────────

describe("Сценарий 9: фильтр по призовому фонду", () => {
  it("setReward сохраняет min и max", () => {
    store.setReward({ min: 1000, max: 50000 });
    expect(store.minReward).toBe(1000);
    expect(store.maxReward).toBe(50000);
  });

  it("fetchContestsFiltered передаёт min_reward и max_reward", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setReward({ min: 1000, max: 50000 });
    await store.fetchContestsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.min_reward).toBe(1000);
    expect(params.max_reward).toBe(50000);
  });
});

// ── 10–11. Фильтр по дате / поиск ────────────────────────────────────────────

describe("Сценарии 10–11: дата окончания и поиск", () => {
  it("setEndBy принимает строку и сохраняет как Date", () => {
    store.setEndBy("2026-12-31");
    expect(store.endBy).toBeInstanceOf(Date);
  });

  it("fetchContestsFiltered передаёт endBy и endAfter", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setEndBy("2026-12-31");
    store.setEndAfter("2026-01-01");
    await store.fetchContestsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.endBy).toBe("2026-12-31");
    expect(params.endAfter).toBe("2026-01-01");
  });

  it("setSearchQuery сохраняет строку", () => {
    store.setSearchQuery("Логотип");
    expect(store.searchQuery).toBe("Логотип");
  });

  it("fetchContestsFiltered передаёт search", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSearchQuery("Лого");
    await store.fetchContestsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].search).toBe("Лого");
  });
});

// ── 12. Сброс фильтров ────────────────────────────────────────────────────────

describe("Сценарий 12: сброс фильтров", () => {
  it("resetFilters очищает все фильтры и вызывает fetch", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSearchQuery("x");
    store.setSelectedStatuses(["active"]);
    store.setReward({ min: 500, max: 1000 });
    store.resetFilters();
    expect(store.searchQuery).toBe("");
    expect(store.selectedStatuses).toHaveLength(0);
    expect(store.minReward).toBe(0);
    expect(api.fetchData).toHaveBeenCalled();
  });
});

// ── 13. Конкурс по номеру ─────────────────────────────────────────────────────

describe("Сценарий 13: конкурс по номеру", () => {
  it("fetchOneContestByNumber возвращает конкурс", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(CONTEST);
    const result = await store.fetchOneContestByNumber(1);
    expect(api.fetchData).toHaveBeenCalledWith("/contests/number/1");
    expect(result.id).toBe(1);
  });

  it("fetchOneContestByNumber при 404 возвращает null", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Not found"));
    const result = await store.fetchOneContestByNumber(999);
    expect(result).toBeNull();
  });
});

// ── 14. Пагинация ─────────────────────────────────────────────────────────────

describe("Сценарий 14: пагинация", () => {
  it("fetchContestsFiltered page=2 передаёт page в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue({ ...PAGINATED, page: 2, pages: 3 });
    await store.fetchContestsFiltered(2);
    expect(vi.mocked(api.fetchData).mock.calls[0][1].page).toBe(2);
    expect(store.currentPage).toBe(2);
    expect(store.totalPages).toBe(3);
  });
});

// ── 15. Создание (не в store) + типы ─────────────────────────────────────────

describe("Сценарий 8b/15: типы конкурсов", () => {
  it("fetchTypes сохраняет список типов", async () => {
    const types = [
      { id: 1, name: "Статья" },
      { id: 2, name: "Логотип" },
    ];
    vi.mocked(api.fetchData).mockResolvedValue(types);
    await store.fetchTypes();
    expect(store.types).toHaveLength(2);
    expect(store.getTypeNameById(1)).toBe("Статья");
  });

  it("getTypeNameById возвращает null если typeId не передан", () => {
    expect(store.getTypeNameById(null)).toBeNull();
  });
});

// ── 17. Свои конкурсы (customer_id filter) ────────────────────────────────────

describe("Сценарий 17: свои конкурсы", () => {
  it("setEmployerId и fetchContestsFiltered передаёт customer_id", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setEmployerId(10);
    await store.fetchContestsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].customer_id).toBe(10);
  });
});

// ── 19. Редактирование этапов ─────────────────────────────────────────────────

describe("Сценарий 19: редактирование этапов", () => {
  it("updateStages вызывает PUT /contests/{id}/stages", async () => {
    const updated = { ...CONTEST, stages: [{ id: 20, name: "New", order: 1 }] };
    vi.mocked(api.updateData).mockResolvedValue(updated);
    const result = await store.updateStages(1, [{ name: "New", order: 1 }]);
    expect(api.updateData).toHaveBeenCalledWith(
      "/contests/1/stages",
      expect.any(Array),
    );
    expect(result.stages).toHaveLength(1);
  });
});

// ── 20–21. Текущий этап ───────────────────────────────────────────────────────

describe("Сценарии 20–21: текущий этап", () => {
  it("setCurrentStage с stage_id вызывает PATCH с query param", async () => {
    vi.mocked(api.patchData).mockResolvedValue({ ...CONTEST, current_stage_id: 11 });
    const result = await store.setCurrentStage(1, 11);
    expect(api.patchData).toHaveBeenCalledWith(
      "/contests/1/current-stage?stage_id=11",
      {},
    );
    expect(result.current_stage_id).toBe(11);
  });

  it("setCurrentStage с null вызывает PATCH без stage_id (авто-режим)", async () => {
    vi.mocked(api.patchData).mockResolvedValue({ ...CONTEST, current_stage_id: null });
    const result = await store.setCurrentStage(1, null);
    expect(api.patchData).toHaveBeenCalledWith("/contests/1/current-stage", {});
    expect(result.current_stage_id).toBeNull();
  });
});

// ── 15. Валидация формы конкурса ──────────────────────────────────────────────

describe("Сценарий 15: валидация формы конкурса", () => {
  it("validateForm возвращает false если поля пустые", () => {
    expect(store.validateForm()).toBe(false);
  });

  it("validateField title слишком короткий → ошибка", () => {
    store.setFormField("title", "abc");
    expect(store.form.title.error).not.toBe("");
  });

  it("validateField title слишком длинный → ошибка", () => {
    store.setFormField("title", "a".repeat(101));
    expect(store.form.title.error).not.toBe("");
  });

  it("validateField title корректный → нет ошибки", () => {
    store.setFormField("title", "Нормальное название конкурса");
    expect(store.form.title.error).toBe("");
  });

  it("validateField annotation слишком короткая → ошибка", () => {
    store.setFormField("annotation", "Кратко");
    expect(store.form.annotation.error).not.toBe("");
  });

  it("validateField annotation корректная → нет ошибки", () => {
    store.setFormField("annotation", "А".repeat(35));
    expect(store.form.annotation.error).toBe("");
  });

  it("validateField prizepool нечисловое → ошибка", () => {
    store.setFormField("prizepool", "abc");
    expect(store.form.prizepool.error).not.toBe("");
  });

  it("validateField prizepool корректный → нет ошибки", () => {
    store.setFormField("prizepool", "5000");
    expect(store.form.prizepool.error).toBe("");
  });

  it("validateField endBy прошедшая дата → ошибка", () => {
    store.setFormField("endBy", "2020-01-01");
    expect(store.form.endBy.error).not.toBe("");
  });

  it("validateField type не задан → ошибка", () => {
    store.validateField("type");
    expect(store.form.type.error).not.toBe("");
  });

  it("validateField type задан → нет ошибки", () => {
    store.form.type.value = { id: 1, name: "Статья" };
    store.validateField("type");
    expect(store.form.type.error).toBe("");
  });
});

// ── 16. Управление этапами формы ─────────────────────────────────────────────

describe("Сценарий 16: управление этапами формы", () => {
  it("addStage добавляет этап с order = 1", () => {
    store.addStage();
    expect(store.stages).toHaveLength(1);
    expect(store.stages[0].order).toBe(1);
  });

  it("addStage дважды → два этапа с разными order", () => {
    store.addStage();
    store.addStage();
    expect(store.stages).toHaveLength(2);
    expect(store.stages[1].order).toBe(2);
  });

  it("removeStage удаляет этап и пересчитывает order", () => {
    store.addStage();
    store.addStage();
    store.addStage();
    store.removeStage(1);
    expect(store.stages).toHaveLength(2);
    expect(store.stages[0].order).toBe(1);
    expect(store.stages[1].order).toBe(2);
  });

  it("updateStage меняет поле нужного этапа", () => {
    store.addStage();
    store.updateStage(0, "name", "Первый этап");
    expect(store.stages[0].name).toBe("Первый этап");
  });

  it("resetForm очищает форму и этапы", () => {
    store.setFormField("title", "Название конкурса для проверки");
    store.addStage();
    store.resetForm();
    expect(store.form.title.value).toBe("");
    expect(store.stages).toHaveLength(0);
  });
});

// ── 14b. Сортировка ───────────────────────────────────────────────────────────

describe("Сценарий 14b: сортировка конкурсов", () => {
  it("setSortBy передаётся в params запроса", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSortBy("prizepool");
    await store.fetchContestsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].sort_by).toBe("prizepool");
  });

  it("setSortDir asc передаётся в params запроса", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSortDir("asc");
    await store.fetchContestsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].sort_dir).toBe("asc");
  });

  it("setSortBy сбрасывает кеш фильтров", () => {
    (store as any)._lastFilterParams = { page: 1 };
    store.setSortBy("ends_at");
    expect((store as any)._lastFilterParams).toBeNull();
  });
});

// ── 13c. Конкурс по ID ────────────────────────────────────────────────────────

describe("Сценарий 13c: конкурс по ID", () => {
  it("fetchOneContestById возвращает конкурс и вызывает /contests/{id}", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(CONTEST);
    const result = await store.fetchOneContestById(1);
    expect(api.fetchData).toHaveBeenCalledWith("/contests/1", {}, { silent: true });
    expect(result.id).toBe(1);
  });

  it("fetchOneContestById при ошибке возвращает null", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Not found"));
    const result = await store.fetchOneContestById(999);
    expect(result).toBeNull();
  });

  it("fetchOneContest — алиас для fetchOneContestById", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(CONTEST);
    const result = await store.fetchOneContest(1);
    expect(result.id).toBe(1);
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe("getStatus helper конкурсов", () => {
  it.each([
    ["draft",     "Черновик"],
    ["active",    "Активный"],
    ["finished",  "Завершённый"],
    ["cancelled", "Отменённый"],
  ])('статус "%s" → "%s"', (key, label) => {
    expect(store.getStatus(key)).toBe(label);
  });

  it("getStatus неизвестного статуса → undefined", () => {
    expect(store.getStatus("unknown")).toBeUndefined();
  });
});

// ── hasFiltersChanged ─────────────────────────────────────────────────────────

describe("hasFiltersChanged", () => {
  it("возвращает true если _lastFilterParams ещё не установлен", () => {
    expect(store.hasFiltersChanged({ page: 1 })).toBe(true);
  });

  it("возвращает false если параметры не изменились", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    await store.fetchContestsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(store.hasFiltersChanged(params)).toBe(false);
  });

  it("возвращает true если параметры изменились", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    await store.fetchContestsFiltered();
    expect(store.hasFiltersChanged({ page: 1, search: "new" })).toBe(true);
  });
});

// ── 7b. Несколько одновременных фильтров ─────────────────────────────────────

describe("Сценарий 7b: комбинированные фильтры", () => {
  it("статус + тип + поиск одновременно передаются в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSelectedStatuses(["active"]);
    store.setSelectedTypes([{ id: 2, name: "Логотип" }]);
    store.setSearchQuery("Заголовок");
    await store.fetchContestsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.statuses).toBe("active");
    expect(params.types).toBe("2");
    expect(params.search).toBe("Заголовок");
  });

  it("resetFilters сбрасывает все фильтры включая sort", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(PAGINATED);
    store.setSelectedStatuses(["active"]);
    store.setSortBy("prizepool");
    store.setSortDir("asc");
    store.resetFilters();
    expect(store.sortBy).toBe("created_at");
    expect(store.sortDir).toBe("desc");
    expect(store.selectedStatuses).toHaveLength(0);
  });
});

// ── 41. Статистика ────────────────────────────────────────────────────────────

describe("Сценарий 41: статистика", () => {
  it("fetchStatistics вызывает GET /statistics и сохраняет данные", async () => {
    const stats = {
      x_labels: ["Статья", "Логотип"],
      datasets: [{ label: "Количество", data: [3, 5] }],
    };
    vi.mocked(api.fetchData).mockResolvedValue(stats);
    await store.fetchStatistics("type", "count");
    expect(api.fetchData).toHaveBeenCalledWith("/statistics", {
      x: "type",
      y: "count",
    });
    expect(store.statistics).toEqual(stats);
  });

  it("fetchStatistics при ошибке не падает", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Forbidden"));
    await expect(store.fetchStatistics()).resolves.toBeUndefined();
    expect(store.statistics).toBeNull();
  });
});

// ── fetchContests ─────────────────────────────────────────────────────────────

describe("fetchContests", () => {
  it("загружает конкурсы и сохраняет в store", async () => {
    const items = [{ id: 1, title: "Contest 1" }];
    vi.mocked(api.fetchData).mockResolvedValue({ items, pages: 3, total: 1 });
    await store.fetchContests();
    expect(api.fetchData).toHaveBeenCalledWith("/contests");
    expect(store.contests).toEqual(items);
  });

  it("при ошибке не падает", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Network"));
    await expect(store.fetchContests()).resolves.toBeUndefined();
  });

  it("при ответе без items устанавливает пустой массив", async () => {
    vi.mocked(api.fetchData).mockResolvedValue({});
    await store.fetchContests();
    expect(store.contests).toEqual([]);
  });
});

// ── fetchContestsByPage ───────────────────────────────────────────────────────

describe("fetchContestsByPage", () => {
  it("загружает страницу конкурсов", async () => {
    const items = [{ id: 2, title: "Contest 2" }];
    vi.mocked(api.fetchData).mockResolvedValue({ items, pages: 5, total: 10 });
    await store.fetchContestsByPage(2);
    expect(api.fetchData).toHaveBeenCalledWith("/contests", { page: 2 });
    expect(store.contests).toEqual(items);
    expect(store.totalPages).toBe(5);
    expect(store.currentPage).toBe(2);
  });

  it("при ошибке не падает", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Network"));
    await expect(store.fetchContestsByPage(1)).resolves.toBeUndefined();
  });
});

// ── setters and getters ───────────────────────────────────────────────────────

describe("setIsAuth и setCurrentContest", () => {
  it("setIsAuth сохраняет значение", () => {
    store.setIsAuth(true);
    expect(store.isAuth).toBe(true);
  });

  it("setCurrentContest сохраняет конкурс", () => {
    const c = { id: 9, title: "Test" };
    store.setCurrentContest(c);
    expect(store.currentContest).toEqual(c);
  });
});

describe("setEndBy и setEndAfter — объект Date", () => {
  it("setEndBy принимает объект Date", () => {
    const d = new Date("2027-01-01");
    store.setEndBy(d);
    expect(store.endBy).toEqual(d);
  });

  it("setEndAfter принимает строку", () => {
    store.setEndAfter("2027-06-01");
    expect(store.endAfter).toEqual(new Date("2027-06-01"));
  });

  it("setEndAfter принимает объект Date", () => {
    const d = new Date("2027-06-01");
    store.setEndAfter(d);
    expect(store.endAfter).toEqual(d);
  });

  it("setEndAfter с null очищает значение", () => {
    store.setEndAfter("2027-01-01");
    store.setEndAfter(null);
    expect(store.endAfter).toBeNull();
  });
});

describe("employerId геттер и сеттер", () => {
  it("setEmployerId сохраняет id", () => {
    store.setEmployerId(42);
    expect(store.employerId).toBe(42);
  });
});
