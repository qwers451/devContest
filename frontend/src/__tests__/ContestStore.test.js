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

let store;

beforeEach(() => {
  store = new ContestStore();
  vi.clearAllMocks();
});

// ── 6. Список конкурсов ───────────────────────────────────────────────────────

describe("Сценарий 6: список конкурсов", () => {
  it("fetchContestsFiltered сохраняет contests в store", async () => {
    api.fetchData.mockResolvedValue(PAGINATED);
    await store.fetchContestsFiltered();
    expect(api.fetchData).toHaveBeenCalledWith("/contests", expect.any(Object));
    expect(store.contests).toHaveLength(1);
    expect(store.contests[0].id).toBe(1);
  });

  it("при ошибке API contests остаётся пустым", async () => {
    api.fetchData.mockRejectedValue(new Error("Network error"));
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
    api.fetchData.mockResolvedValue(PAGINATED);
    store.setSelectedStatuses(["active", "draft"]);
    await store.fetchContestsFiltered();
    const params = api.fetchData.mock.calls[0][1];
    expect(params.statuses).toBe("active,draft");
  });
});

// ── 8. Фильтр по типу конкурса ────────────────────────────────────────────────

describe("Сценарий 8: фильтр по типу", () => {
  it("fetchContestsFiltered передаёт несколько types в params", async () => {
    api.fetchData.mockResolvedValue(PAGINATED);
    store.setSelectedTypes([
      { id: 2, name: "Логотип" },
      { id: 3, name: "Баннер" },
    ]);
    await store.fetchContestsFiltered();
    const params = api.fetchData.mock.calls[0][1];
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
    api.fetchData.mockResolvedValue(PAGINATED);
    store.setReward({ min: 1000, max: 50000 });
    await store.fetchContestsFiltered();
    const params = api.fetchData.mock.calls[0][1];
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
    api.fetchData.mockResolvedValue(PAGINATED);
    store.setEndBy("2026-12-31");
    store.setEndAfter("2026-01-01");
    await store.fetchContestsFiltered();
    const params = api.fetchData.mock.calls[0][1];
    expect(params.endBy).toBe("2026-12-31");
    expect(params.endAfter).toBe("2026-01-01");
  });

  it("setSearchQuery сохраняет строку", () => {
    store.setSearchQuery("Логотип");
    expect(store.searchQuery).toBe("Логотип");
  });

  it("fetchContestsFiltered передаёт search", async () => {
    api.fetchData.mockResolvedValue(PAGINATED);
    store.setSearchQuery("Лого");
    await store.fetchContestsFiltered();
    expect(api.fetchData.mock.calls[0][1].search).toBe("Лого");
  });
});

// ── 12. Сброс фильтров ────────────────────────────────────────────────────────

describe("Сценарий 12: сброс фильтров", () => {
  it("resetFilters очищает все фильтры и вызывает fetch", async () => {
    api.fetchData.mockResolvedValue(PAGINATED);
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
    api.fetchData.mockResolvedValue(CONTEST);
    const result = await store.fetchOneContestByNumber(1);
    expect(api.fetchData).toHaveBeenCalledWith("/contests/number/1");
    expect(result.id).toBe(1);
  });

  it("fetchOneContestByNumber при 404 возвращает null", async () => {
    api.fetchData.mockRejectedValue(new Error("Not found"));
    const result = await store.fetchOneContestByNumber(999);
    expect(result).toBeNull();
  });
});

// ── 14. Пагинация ─────────────────────────────────────────────────────────────

describe("Сценарий 14: пагинация", () => {
  it("fetchContestsFiltered page=2 передаёт page в params", async () => {
    api.fetchData.mockResolvedValue({ ...PAGINATED, page: 2, pages: 3 });
    await store.fetchContestsFiltered(2);
    expect(api.fetchData.mock.calls[0][1].page).toBe(2);
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
    api.fetchData.mockResolvedValue(types);
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
    api.fetchData.mockResolvedValue(PAGINATED);
    store.setEmployerId(10);
    await store.fetchContestsFiltered();
    expect(api.fetchData.mock.calls[0][1].customer_id).toBe(10);
  });
});

// ── 19. Редактирование этапов ─────────────────────────────────────────────────

describe("Сценарий 19: редактирование этапов", () => {
  it("updateStages вызывает PUT /contests/{id}/stages", async () => {
    const updated = { ...CONTEST, stages: [{ id: 20, name: "New", order: 1 }] };
    api.updateData.mockResolvedValue(updated);
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
    api.patchData.mockResolvedValue({ ...CONTEST, current_stage_id: 11 });
    const result = await store.setCurrentStage(1, 11);
    expect(api.patchData).toHaveBeenCalledWith(
      "/contests/1/current-stage?stage_id=11",
      {},
    );
    expect(result.current_stage_id).toBe(11);
  });

  it("setCurrentStage с null вызывает PATCH без stage_id (авто-режим)", async () => {
    api.patchData.mockResolvedValue({ ...CONTEST, current_stage_id: null });
    const result = await store.setCurrentStage(1, null);
    expect(api.patchData).toHaveBeenCalledWith("/contests/1/current-stage", {});
    expect(result.current_stage_id).toBeNull();
  });
});

// ── 41. Статистика ────────────────────────────────────────────────────────────

describe("Сценарий 41: статистика", () => {
  it("fetchStatistics вызывает GET /statistics и сохраняет данные", async () => {
    const stats = {
      x_labels: ["Статья", "Логотип"],
      datasets: [{ label: "Количество", data: [3, 5] }],
    };
    api.fetchData.mockResolvedValue(stats);
    await store.fetchStatistics("type", "count");
    expect(api.fetchData).toHaveBeenCalledWith("/statistics", {
      x: "type",
      y: "count",
    });
    expect(store.statistics).toEqual(stats);
  });

  it("fetchStatistics при ошибке не падает", async () => {
    api.fetchData.mockRejectedValue(new Error("Forbidden"));
    await expect(store.fetchStatistics()).resolves.toBeUndefined();
    expect(store.statistics).toBeNull();
  });
});
