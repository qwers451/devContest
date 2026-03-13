/**
 * Vitest unit tests for SolutionStore
 * Covers scenarios 22–33 (solution list, filters, management)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as api from '../services/apiService';
import SolutionStore from '../store/SolutionStore';

const SUBMISSION = {
    id: 5, number: 5, contest_id: 1, executor_id: 3,
    title: 'Test Submission', annotation: 'Ann',
    description: 'Desc', files: [], status: 1,
    executor_login: 'executor1', contest_title: 'Test Contest',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

let store;

beforeEach(() => {
    store = new SolutionStore();
    vi.clearAllMocks();
});


// ── 22–23. Список решений ─────────────────────────────────────────────────────

describe('Сценарии 22–23: список решений', () => {
    it('fetchSolutionsFiltered сохраняет список в store', async () => {
        api.fetchData.mockResolvedValue([SUBMISSION]);
        await store.fetchSolutionsFiltered();
        expect(store.solutions).toHaveLength(1);
        expect(store.solutions[0].id).toBe(5);
    });

    it('setContestId передаёт contest_id в params', async () => {
        api.fetchData.mockResolvedValue([SUBMISSION]);
        store.setContestId(1);
        await store.fetchSolutionsFiltered();
        expect(api.fetchData.mock.calls[0][1].contest_id).toBe(1);
    });

    it('setFreelancerId передаёт executor_id в params', async () => {
        api.fetchData.mockResolvedValue([SUBMISSION]);
        store.setFreelancerId(3);
        await store.fetchSolutionsFiltered();
        expect(api.fetchData.mock.calls[0][1].executor_id).toBe(3);
    });

    it('при ошибке API solutions остаётся пустым', async () => {
        api.fetchData.mockRejectedValue(new Error('err'));
        await store.fetchSolutionsFiltered();
        expect(store.solutions).toHaveLength(0);
    });
});


// ── 24. Фильтр по статусу ─────────────────────────────────────────────────────

describe('Сценарий 24: фильтр по статусу решения', () => {
    it('setSelectedStatuses сохраняет значения', () => {
        store.setSelectedStatuses([1, 3]);
        expect(store.selectedStatuses).toEqual([1, 3]);
    });

    it('fetchSolutionsFiltered передаёт status в params', async () => {
        api.fetchData.mockResolvedValue([SUBMISSION]);
        store.setSelectedStatuses([2]);
        await store.fetchSolutionsFiltered();
        expect(api.fetchData.mock.calls[0][1].status).toBe(2);
    });
});


// ── 25. Фильтр по дате ────────────────────────────────────────────────────────

describe('Сценарий 25: фильтр по дате добавления', () => {
    it('setAddedBefore сохраняет дату', () => {
        store.setAddedBefore('2026-01-01');
        expect(store.addedBefore).toBeInstanceOf(Date);
    });

    it('setAddedAfter с null очищает значение', () => {
        store.setAddedAfter('2026-01-01');
        store.setAddedAfter(null);
        expect(store.addedAfter).toBeNull();
    });
});


// ── 27. Сброс фильтров ────────────────────────────────────────────────────────

describe('Сценарий 27: сброс фильтров решений', () => {
    it('resetFilters очищает все фильтры и вызывает fetch', async () => {
        api.fetchData.mockResolvedValue([]);
        store.setSelectedStatuses([1, 2]);
        store.setAddedBefore('2026-01-01');
        store.resetFilters();
        expect(store.selectedStatuses).toHaveLength(0);
        expect(store.addedBefore).toBeNull();
        expect(api.fetchData).toHaveBeenCalled();
    });
});


// ── 28. Решение по номеру ─────────────────────────────────────────────────────

describe('Сценарий 28: решение по номеру', () => {
    it('fetchSolutionByNumber возвращает решение и сохраняет в store', async () => {
        api.fetchData.mockResolvedValue(SUBMISSION);
        const result = await store.fetchSolutionByNumber(5);
        expect(api.fetchData).toHaveBeenCalledWith('/submissions/number/5');
        expect(result.id).toBe(5);
        expect(store.currentSolution.id).toBe(5);
    });

    it('getSolutionIfExists возвращает из кеша если number совпадает', async () => {
        api.fetchData.mockResolvedValue(SUBMISSION);
        await store.fetchSolutionByNumber(5);
        expect(store.getSolutionIfExists(5)).not.toBeNull();
        expect(store.getSolutionIfExists(99)).toBeNull();
    });
});


// ── 29. Создание (валидация формы) ────────────────────────────────────────────

describe('Сценарий 29: валидация формы решения', () => {
    it('validateForm возвращает false если поля пустые', () => {
        expect(store.validateForm()).toBe(false);
    });

    it('validateForm возвращает true для корректных данных', () => {
        store.setFormField('title', 'Нормальное название решения');
        store.setFormField('annotation', 'Нормальная аннотация решения достаточной длины');
        store.setFormField('description', 'D'.repeat(110));
        expect(store.validateForm()).toBe(true);
    });

    it('setFormField проставляет ошибку при слишком коротком title', () => {
        store.setFormField('title', 'abc');
        expect(store.form.title.error).not.toBe('');
    });
});


// ── 32. Изменение статуса ─────────────────────────────────────────────────────

describe('Сценарий 32: изменение статуса решения', () => {
    it('updateSolutionStatus вызывает PATCH с нужными параметрами', async () => {
        const updated = { ...SUBMISSION, status: 2 };
        api.patchData.mockResolvedValue(updated);
        store.setSolutions([SUBMISSION]);
        store.setCurrentSolution(SUBMISSION);
        await store.updateSolutionStatus(5, 2);
        expect(api.patchData).toHaveBeenCalledWith(
            '/submissions/5/status', {}, { status: 2 }
        );
    });

    it('updateSolutionStatus выбрасывает ошибку при невалидном статусе', async () => {
        await expect(store.updateSolutionStatus(5, 99)).rejects.toThrow();
    });

    it('_updateLocalSolution обновляет решение в списке', async () => {
        const updated = { ...SUBMISSION, status: 3 };
        api.patchData.mockResolvedValue(updated);
        store.setSolutions([SUBMISSION]);
        store.setCurrentSolution(SUBMISSION);
        await store.updateSolutionStatus(5, 3);
        expect(store.solutions[0].status).toBe(3);
        expect(store.currentSolution.status).toBe(3);
    });
});


// ── 31. Удаление решения ──────────────────────────────────────────────────────

describe('Сценарий 31: удаление решения', () => {
    it('deleteSolutionById вызывает DELETE и сбрасывает currentSolution', async () => {
        api.deleteData.mockResolvedValue(undefined);
        store.setCurrentSolution(SUBMISSION);
        await store.deleteSolutionById(5);
        expect(api.deleteData).toHaveBeenCalledWith('/submissions/5');
        expect(store.currentSolution).toBeNull();
    });

    it('deleteSolutionById пробрасывает ошибку при неудаче', async () => {
        api.deleteData.mockRejectedValue(new Error('Forbidden'));
        await expect(store.deleteSolutionById(5)).rejects.toThrow('Forbidden');
    });
});


// ── 33. Выбор победителя ──────────────────────────────────────────────────────

describe('Сценарий 33: выбор победителя', () => {
    it('selectWinner вызывает POST /contests/{id}/winner', async () => {
        api.sendData.mockResolvedValue({ id: 1, status: 'finished' });
        const result = await store.selectWinner(1, 5, 3);
        expect(api.sendData).toHaveBeenCalledWith(
            '/contests/1/winner?submission_id=5&executor_id=3', {}
        );
        expect(result.status).toBe('finished');
    });
});


// ── getStatus helper ──────────────────────────────────────────────────────────

describe('getStatus helper', () => {
    it.each([
        [1, 'Новое'],
        [2, 'Просмотрено'],
        [3, 'Победитель'],
        [4, 'Необходимы правки'],
        [5, 'Правки внесены'],
    ])('статус %i → "%s"', (num, label) => {
        expect(store.getStatus(num).label).toBe(label);
    });

    it('неизвестный статус → "Неизвестно"', () => {
        expect(store.getStatus(99).label).toBe('Неизвестно');
    });
});
