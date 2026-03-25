import { describe, it, expect, beforeEach, vi } from "vitest";
import * as api from "../services/apiService";
import SolutionStore from "../store/SolutionStore";

const SUBMISSION = {
  id: 5,
  number: 5,
  contest_id: 1,
  executor_id: 3,
  title: "Test Submission",
  annotation: "Ann",
  description: "Desc",
  files: [],
  status: 1,
  executor_login: "executor1",
  contest_title: "Test Contest",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let store: SolutionStore;

beforeEach(() => {
  store = new SolutionStore();
  vi.clearAllMocks();
});


describe("Сценарии 22–23: список решений", () => {
  it("fetchSolutionsFiltered сохраняет список в store", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    await store.fetchSolutionsFiltered();
    expect(store.solutions).toHaveLength(1);
    expect(store.solutions[0].id).toBe(5);
  });

  it("setContestId передаёт contest_id в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setContestId(1);
    await store.fetchSolutionsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].contest_id).toBe(1);
  });

  it("setFreelancerId передаёт executor_id в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setFreelancerId(3);
    await store.fetchSolutionsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].executor_id).toBe(3);
  });

  it("при ошибке API solutions остаётся пустым", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("err"));
    await store.fetchSolutionsFiltered();
    expect(store.solutions).toHaveLength(0);
  });
});


describe("Сценарий 24: фильтр по статусу решения", () => {
  it("setSelectedStatuses сохраняет значения", () => {
    store.setSelectedStatuses([1, 3]);
    expect(store.selectedStatuses).toEqual([1, 3]);
  });

  it("fetchSolutionsFiltered передаёт несколько statuses в params", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setSelectedStatuses([2, 3]);
    await store.fetchSolutionsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].statuses).toBe("2,3");
  });
});


describe("Сценарий 25: фильтр по дате добавления", () => {
  it("setAddedBefore сохраняет дату", () => {
    store.setAddedBefore("2026-01-01");
    expect(store.addedBefore).toBeInstanceOf(Date);
  });

  it("fetchSolutionsFiltered передаёт addedBefore и addedAfter", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setAddedBefore("2026-01-01");
    store.setAddedAfter("2026-02-01");
    await store.fetchSolutionsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.addedBefore).toBe("2026-01-01");
    expect(params.addedAfter).toBe("2026-02-01");
  });

  it("setAddedAfter с null очищает значение", () => {
    store.setAddedAfter("2026-01-01");
    store.setAddedAfter(null);
    expect(store.addedAfter).toBeNull();
  });
});


describe("Сценарий 27: сброс фильтров решений", () => {
  it("resetFilters очищает все фильтры и вызывает fetch", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([]);
    store.setSelectedStatuses([1, 2]);
    store.setAddedBefore("2026-01-01");
    store.resetFilters();
    expect(store.selectedStatuses).toHaveLength(0);
    expect(store.addedBefore).toBeNull();
    expect(api.fetchData).toHaveBeenCalled();
  });
});


describe("Сценарий 28: решение по номеру", () => {
  it("fetchSolutionByNumber возвращает решение и сохраняет в store", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(SUBMISSION);
    const result = await store.fetchSolutionByNumber(5);
    expect(api.fetchData).toHaveBeenCalledWith("/submissions/number/5");
    expect(result.id).toBe(5);
    expect(store.currentSolution.id).toBe(5);
  });

  it("getSolutionIfExists возвращает из кеша если number совпадает", async () => {
    vi.mocked(api.fetchData).mockResolvedValue(SUBMISSION);
    await store.fetchSolutionByNumber(5);
    expect(store.getSolutionIfExists(5)).not.toBeNull();
    expect(store.getSolutionIfExists(99)).toBeNull();
  });
});


describe("Сценарий 29: валидация формы решения", () => {
  it("validateForm возвращает false если поля пустые", () => {
    expect(store.validateForm()).toBe(false);
  });

  it("validateForm возвращает true для корректных данных", () => {
    store.setFormField("title", "Нормальное название решения");
    store.setFormField(
      "annotation",
      "Нормальная аннотация решения достаточной длины",
    );
    store.setFormField("description", "D".repeat(110));
    expect(store.validateForm()).toBe(true);
  });

  it("setFormField проставляет ошибку при слишком коротком title", () => {
    store.setFormField("title", "abc");
    expect(store.form.title.error).not.toBe("");
  });
});


describe("Сценарий 32: изменение статуса решения", () => {
  it("updateSolutionStatus вызывает PATCH с нужными параметрами", async () => {
    const updated = { ...SUBMISSION, status: 2 };
    vi.mocked(api.patchData).mockResolvedValue(updated);
    store.setSolutions([SUBMISSION]);
    store.setCurrentSolution(SUBMISSION);
    await store.updateSolutionStatus(5, 2);
    expect(api.patchData).toHaveBeenCalledWith(
      "/submissions/5/status",
      {},
      { status: 2 },
    );
  });

  it("updateSolutionStatus выбрасывает ошибку при невалидном статусе", async () => {
    await expect(store.updateSolutionStatus(5, 99)).rejects.toThrow();
  });

  it("_updateLocalSolution обновляет решение в списке", async () => {
    const updated = { ...SUBMISSION, status: 3 };
    vi.mocked(api.patchData).mockResolvedValue(updated);
    store.setSolutions([SUBMISSION]);
    store.setCurrentSolution(SUBMISSION);
    await store.updateSolutionStatus(5, 3);
    expect(store.solutions[0].status).toBe(3);
    expect(store.currentSolution.status).toBe(3);
  });
});


describe("Сценарий 31: удаление решения", () => {
  it("deleteSolutionById вызывает DELETE и сбрасывает currentSolution", async () => {
    vi.mocked(api.deleteData).mockResolvedValue(undefined);
    store.setCurrentSolution(SUBMISSION);
    await store.deleteSolutionById(5);
    expect(api.deleteData).toHaveBeenCalledWith("/submissions/5");
    expect(store.currentSolution).toBeNull();
  });

  it("deleteSolutionById пробрасывает ошибку при неудаче", async () => {
    vi.mocked(api.deleteData).mockRejectedValue(new Error("Forbidden"));
    await expect(store.deleteSolutionById(5)).rejects.toThrow("Forbidden");
  });
});


describe("Сценарий 33: выбор победителя", () => {
  it("selectWinner вызывает POST /contests/{id}/winner", async () => {
    vi.mocked(api.sendData).mockResolvedValue({ id: 1, status: "finished" });
    const result = await store.selectWinner(1, 5, 3);
    expect(api.sendData).toHaveBeenCalledWith(
      "/contests/1/winner?submission_id=5&executor_id=3",
      {},
    );
    expect(result.status).toBe("finished");
  });
});


describe("Сценарий 26: сортировка решений", () => {
  it("setSortBy передаётся в params запроса", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setSortBy("ai_score");
    await store.fetchSolutionsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].sort_by).toBe("ai_score");
  });

  it("setSortDir asc передаётся в params запроса", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setSortDir("asc");
    await store.fetchSolutionsFiltered();
    expect(vi.mocked(api.fetchData).mock.calls[0][1].sort_dir).toBe("asc");
  });

  it("setSortBy сбрасывает кеш фильтров", () => {
    store._lastFilterParams = { page: 1 };
    store.setSortBy("ai_score");
    expect(store._lastFilterParams).toBeNull();
  });
});


describe("Сценарий 30: пагинация решений", () => {
  it("setPage устанавливает номер страницы", () => {
    store.setPage(3);
    expect(store.page).toBe(3);
  });

  it("setLimit устанавливает лимит", () => {
    store.setLimit(10);
    expect(store.limit).toBe(10);
  });

  it("fetchSolutionsFiltered передаёт page и limit", async () => {
    vi.mocked(api.fetchData).mockResolvedValue([SUBMISSION]);
    store.setPage(2);
    store.setLimit(5);
    await store.fetchSolutionsFiltered();
    const params = vi.mocked(api.fetchData).mock.calls[0][1];
    expect(params.page).toBe(2);
    expect(params.limit).toBe(5);
  });
});


describe("Сценарий 29b: граничные случаи валидации формы решения", () => {
  it("validateField annotation слишком короткая → ошибка", () => {
    store.setFormField("annotation", "Кратко");
    expect(store.form.annotation.error).not.toBe("");
  });

  it("validateField annotation максимальной длины → нет ошибки", () => {
    store.setFormField("annotation", "А".repeat(200));
    expect(store.form.annotation.error).toBe("");
  });

  it("validateField annotation слишком длинная → ошибка", () => {
    store.setFormField("annotation", "А".repeat(201));
    expect(store.form.annotation.error).not.toBe("");
  });

  it("validateField description минимальной длины → нет ошибки", () => {
    store.setFormField("description", "D".repeat(100));
    expect(store.form.description.error).toBe("");
  });

  it("validateField description слишком короткое → ошибка", () => {
    store.setFormField("description", "D".repeat(50));
    expect(store.form.description.error).not.toBe("");
  });

  it("resetForm очищает все поля и ошибки", () => {
    store.setFormField("title", "Было название решения");
    store.resetForm();
    expect(store.form.title.value).toBe("");
    expect(store.form.title.error).toBe("");
  });
});


describe("Сценарий 33b: выбор победителя с этапом (milestone)", () => {
  it("selectWinner с stageId добавляет stage_id в URL", async () => {
    vi.mocked(api.sendData).mockResolvedValue({ id: 1, status: "finished" });
    await store.selectWinner(1, 5, 3, 11);
    expect(api.sendData).toHaveBeenCalledWith(
      "/contests/1/winner?submission_id=5&executor_id=3&stage_id=11",
      {},
    );
  });

  it("selectWinner без stageId не добавляет stage_id в URL", async () => {
    vi.mocked(api.sendData).mockResolvedValue({ id: 1, status: "finished" });
    await store.selectWinner(1, 5, 3);
    const url = api.sendData.mock.calls[0][0];
    expect(url).not.toContain("stage_id");
  });
});


describe("Сценарий 34: оценка ИИ (fetchEvaluation / triggerEvaluation)", () => {
  it("fetchEvaluation при 404 возвращает false и не сохраняет данные", async () => {
    vi.mocked(api.fetchDataRaw).mockResolvedValue({ status: 404, data: null });
    const result = await store.fetchEvaluation(5);
    expect(result).toBe(false);
    expect(store.evaluation).toBeNull();
    expect(store.evaluationLoading).toBe(false);
  });

  it("fetchEvaluation успешно — возвращает true и сохраняет результат", async () => {
    const evalData = {
      compliance_score: 75,
      passed_requirements: ["Требование 1"],
      failed_requirements: [],
      critical_issues: false,
    };
    vi.mocked(api.fetchDataRaw).mockResolvedValue({ status: 200, data: evalData });
    const result = await store.fetchEvaluation(5);
    expect(result).toBe(true);
    expect(store.evaluation).toEqual(evalData);
    expect(store.evaluationLoading).toBe(false);
  });

  it("fetchEvaluation при сетевой ошибке возвращает false", async () => {
    vi.mocked(api.fetchDataRaw).mockRejectedValue(new Error("Network error"));
    const result = await store.fetchEvaluation(5);
    expect(result).toBe(false);
    expect(store.evaluationLoading).toBe(false);
  });

  it("markEvaluationUnavailable устанавливает флаг evaluationUnavailable", () => {
    store.markEvaluationUnavailable();
    expect(store.evaluationUnavailable).toBe(true);
  });

  it("triggerEvaluation вызывает POST /submissions/{id}/evaluate", async () => {
    vi.mocked(api.sendData).mockResolvedValue({});
    await store.triggerEvaluation(5);
    expect(api.sendData).toHaveBeenCalledWith("/submissions/5/evaluate", {});
  });

  it("triggerEvaluation сбрасывает evaluation и evaluationUnavailable", async () => {
    store.evaluation = { compliance_score: 50 };
    store.evaluationUnavailable = true;
    vi.mocked(api.sendData).mockResolvedValue({});
    await store.triggerEvaluation(5);
    expect(store.evaluation).toBeNull();
    expect(store.evaluationUnavailable).toBe(false);
  });
});


describe("statusOptions getter", () => {
  it("возвращает массив из 5 опций", () => {
    expect(store.statusOptions).toHaveLength(5);
  });

  it("каждая опция содержит value, label, color", () => {
    for (const opt of store.statusOptions) {
      expect(typeof opt.value).toBe("number");
      expect(typeof opt.label).toBe("string");
      expect(typeof opt.color).toBe("string");
    }
  });

  it("первая опция — Новое (value=1)", () => {
    expect(store.statusOptions[0].value).toBe(1);
    expect(store.statusOptions[0].label).toBe("Новое");
  });
});


describe("getStatus helper", () => {
  it.each([
    [1, "Новое"],
    [2, "Просмотрено"],
    [3, "Победитель"],
    [4, "Необходимы правки"],
    [5, "Правки внесены"],
  ])('статус %i → "%s"', (num, label) => {
    expect(store.getStatus(num).label).toBe(label);
  });

  it('неизвестный статус → "Неизвестно"', () => {
    expect(store.getStatus(99).label).toBe("Неизвестно");
  });
});


describe("setSearchQuery и геттер", () => {
  it("setSearchQuery сохраняет запрос и флаг", () => {
    store.setSearchQuery("test query", true);
    expect(store.searchQuery).toBe("test query");
  });
});

describe("setAddedBefore с null", () => {
  it("setAddedBefore(null) очищает значение", () => {
    store.setAddedBefore("2026-01-01");
    store.setAddedBefore(null);
    expect(store.addedBefore).toBeNull();
  });
});


describe("геттеры freelancerId, contestId, totalCount", () => {
  it("setFreelancerId и геттер", () => {
    store.setFreelancerId(10);
    expect(store.freelancerId).toBe(10);
  });

  it("setContestId и геттер", () => {
    store.setContestId(20);
    expect(store.contestId).toBe(20);
  });

  it("totalCount начальное значение 0", () => {
    expect(store.totalCount).toBe(0);
  });
});


describe("cache hit в fetchSolutionsFiltered", () => {
  it("не делает запрос если фильтры не изменились и есть кеш", async () => {
    const list = [{ id: 1, title: "S1" }];
    vi.mocked(api.fetchData).mockResolvedValue(list);
    await store.fetchSolutionsFiltered();
    vi.clearAllMocks();
    await store.fetchSolutionsFiltered();
    expect(api.fetchData).not.toHaveBeenCalled();
  });
});


describe("fetchSolutionByNumber ошибка", () => {
  it("при ошибке возвращает null и не падает", async () => {
    vi.mocked(api.fetchData).mockRejectedValue(new Error("Not found"));
    const result = await store.fetchSolutionByNumber(9999);
    expect(result).toBeNull();
  });
});
