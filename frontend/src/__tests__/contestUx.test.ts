import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateDistribution,
  splitPrize,
  commissionOf,
  netPayout,
  placesCountLabel,
  buildPrizeRows,
} from "../utils/prizes";
import { getCountdown, formatCountdown, formatCountdownShort, submissionBlockReason } from "../utils/deadline";
import { addComment, loadComments, saveComments, threadOf } from "../utils/contestComments";

describe("validateDistribution", () => {
  it("принимает корректные распределения", () => {
    expect(validateDistribution([100])).toBeNull();
    expect(validateDistribution([60, 30, 10])).toBeNull();
    expect(validateDistribution([40, 20, 20, 10, 10])).toBeNull();
  });
  it("отклоняет неверную сумму с указанием текущей", () => {
    expect(validateDistribution([60, 30])).toContain("90%");
    expect(validateDistribution([60, 50])).toContain("110%");
  });
  it("отклоняет 0 мест и больше 5 мест", () => {
    expect(validateDistribution([])).not.toBeNull();
    expect(validateDistribution([20, 20, 20, 20, 10, 10])).not.toBeNull();
  });
  it("отклоняет нецелые и нулевые доли", () => {
    expect(validateDistribution([50.5, 49.5])).not.toBeNull();
    expect(validateDistribution([100, 0])).not.toBeNull();
    expect(validateDistribution([101, -1])).not.toBeNull();
  });
});

describe("splitPrize", () => {
  it("сумма по местам равна фонду до копейки, остаток у последнего места", () => {
    const parts = [33, 33, 34];
    const total = 100.01;
    const res = splitPrize(total, parts);
    const sum = Object.values(res).reduce((a, b) => a + Math.round(b * 100), 0);
    expect(sum).toBe(Math.round(total * 100));
    expect(res[1]).toBe(33.0);
    expect(res[2]).toBe(33.0);
    expect(res[3]).toBe(34.01);
  });
  it("простое деление 60/30/10", () => {
    expect(splitPrize(10000, [60, 30, 10])).toEqual({ 1: 6000, 2: 3000, 3: 1000 });
  });
  it("доля неприсуждённых мест уходит последнему присуждённому", () => {
    // награждены 1 и 2 места из 3: второе получает 30% + 10%
    expect(splitPrize(10000, [60, 30, 10], [1, 2])).toEqual({ 1: 6000, 2: 4000 });
    // награждено только первое место — оно забирает весь фонд
    expect(splitPrize(10000, [60, 30, 10], [1])).toEqual({ 1: 10000 });
  });
  it("игнорирует места вне распределения и пустой список", () => {
    expect(splitPrize(100, [100], [])).toEqual({});
    expect(splitPrize(100, [100], [1, 4])).toEqual({ 1: 100 });
  });
});

describe("комиссия и сумма на руки", () => {
  it("10% от 6000 = 600, на руки 5400", () => {
    expect(commissionOf(6000, 10)).toBe(600);
    expect(netPayout(6000, 10)).toBe(5400);
  });
  it("округляет до копеек, gross = net + commission", () => {
    const gross = 333.33;
    const c = commissionOf(gross, 10);
    expect(c).toBe(33.33);
    expect(netPayout(gross, 10)).toBe(300.0);
    expect(Math.round((c + netPayout(gross, 10)) * 100)).toBe(Math.round(gross * 100));
  });
  it("0% комиссии и некорректный процент", () => {
    expect(netPayout(1000, 0)).toBe(1000);
    expect(netPayout(1000, 150)).toBe(0);
    expect(netPayout(1000, NaN)).toBe(900);
  });
});

describe("placesCountLabel", () => {
  it("склоняет по-русски", () => {
    expect(placesCountLabel(1)).toBe("1 призовое место");
    expect(placesCountLabel(2)).toBe("2 призовых места");
    expect(placesCountLabel(3)).toBe("3 призовых места");
    expect(placesCountLabel(5)).toBe("5 призовых мест");
  });
});

describe("обратный отсчёт", () => {
  const now = new Date("2026-06-01T12:00:00Z").getTime();
  const plus = (ms: number) => new Date(now + ms).toISOString();
  const H = 3600000;
  const M = 60000;

  it("2 д 4 ч 13 мин", () => {
    const c = getCountdown(plus(2 * 24 * H + 4 * H + 13 * M + 5000), now);
    expect(formatCountdown(c)).toBe("Осталось 2 д 4 ч 13 мин");
    expect(c.urgent).toBe(false);
  });
  it("меньше суток — urgent, без дней", () => {
    const c = getCountdown(plus(23 * H + 59 * M), now);
    expect(c.urgent).toBe(true);
    expect(formatCountdown(c)).toBe("Осталось 23 ч 59 мин");
  });
  it("ровно сутки уже не urgent", () => {
    expect(getCountdown(plus(24 * H), now).urgent).toBe(false);
  });
  it("прошедший срок", () => {
    const c = getCountdown(plus(-1000), now);
    expect(c.expired).toBe(true);
    expect(c.urgent).toBe(false);
    expect(formatCountdown(c)).toBe("Приём работ завершён");
    expect(formatCountdownShort(c)).toBeNull();
  });
  it("некорректная дата считается истёкшей", () => {
    expect(getCountdown("not-a-date", now).expired).toBe(true);
  });
  it("короткая форма", () => {
    expect(formatCountdownShort(getCountdown(plus(3 * 24 * H + H), now))).toBe("3 дня");
    expect(formatCountdownShort(getCountdown(plus(5 * 24 * H + H), now))).toBe("5 дней");
    expect(formatCountdownShort(getCountdown(plus(24 * H + H), now))).toBe("1 день");
    expect(formatCountdownShort(getCountdown(plus(5 * H + M), now))).toBe("5 ч");
    expect(formatCountdownShort(getCountdown(plus(10 * M + 1000), now))).toBe("10 мин");
  });
  it("причина блокировки отправки решения", () => {
    expect(submissionBlockReason("active", plus(H), now)).toBeNull();
    expect(submissionBlockReason("finished", plus(H), now)).toBe("Конкурс не принимает решения");
    expect(submissionBlockReason("active", plus(-H), now)).toBe("Срок приёма решений истёк");
  });
});

describe("обсуждение конкурса", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  const author = { authorId: 5, authorLogin: "ivan", isCustomer: false };

  it("добавляет комментарий и обрезает пробелы; пустой игнорирует", () => {
    let list = addComment([], { ...author, text: "  Привет  " });
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe("Привет");
    expect(addComment(list, { ...author, text: "   " })).toBe(list);
  });
  it("ответ крепится к родителю, ответ на ответ — к корню (один уровень)", () => {
    let list = addComment([], { ...author, text: "вопрос" });
    const root = list[0];
    list = addComment(list, { authorId: 1, authorLogin: "cust", isCustomer: true, text: "ответ", parentId: root.id });
    const reply = list[1];
    list = addComment(list, { ...author, text: "уточнение", parentId: reply.id });
    expect(list[1].parentId).toBe(root.id);
    expect(list[2].parentId).toBe(root.id);
    const threads = threadOf(list);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies).toHaveLength(2);
    expect(threads[0].replies[0].isCustomer).toBe(true);
  });
  it("ответ на несуществующий комментарий не добавляется", () => {
    const list = addComment([], { ...author, text: "x", parentId: "nope" });
    expect(list).toHaveLength(0);
  });
  it("сохраняется и читается из localStorage отдельно по конкурсам", () => {
    const list = addComment([], { ...author, text: "один" });
    saveComments(1, list);
    expect(loadComments(1)).toHaveLength(1);
    expect(loadComments(1)[0].text).toBe("один");
    expect(loadComments(2)).toEqual([]);
  });
  it("битое хранилище не ломает загрузку", () => {
    localStorage.setItem("devcontest.discussion.7", "{not json");
    expect(loadComments(7)).toEqual([]);
    localStorage.setItem("devcontest.discussion.8", JSON.stringify({ a: 1 }));
    expect(loadComments(8)).toEqual([]);
    localStorage.setItem("devcontest.discussion.9", JSON.stringify([{ id: "1", text: "ok", authorLogin: "a", createdAt: "2026-01-01" }, 42, null]));
    const res = loadComments(9);
    expect(res).toHaveLength(1);
    expect(res[0].parentId).toBeNull();
  });
  it("недоступное хранилище не бросает исключений", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveComments(1, [])).not.toThrow();
    spy.mockRestore();
    const spy2 = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadComments(1)).toEqual([]);
    spy2.mockRestore();
  });
});

describe("buildPrizeRows", () => {
  const awards = [
    { place: 1, amount: 6000, net_amount: 5400 },
    { place: 3, amount: 4000, net_amount: 3600 },
  ];
  it("активный конкурс: номинальное деление", () => {
    const rows = buildPrizeRows(10000, [60, 30, 10], 10, false, awards);
    expect(rows.map((r) => r.gross)).toEqual([6000, 3000, 1000]);
    expect(rows.map((r) => r.net)).toEqual([5400, 2700, 900]);
    expect(rows.every((r) => r.awarded)).toBe(true);
  });
  it("завершённый: фактические суммы, пропущенное место не присуждено", () => {
    const rows = buildPrizeRows(10000, [60, 30, 10], 10, true, awards);
    expect(rows[1]).toMatchObject({ awarded: false, gross: null, net: null });
    expect(rows[0]).toMatchObject({ awarded: true, gross: 6000, net: 5400 });
    expect(rows[2]).toMatchObject({ awarded: true, gross: 4000, net: 3600 });
  });
  it("завершённый без наград (старые данные): номинальное деление", () => {
    expect(buildPrizeRows(100, [100], 10, true, [])[0]).toMatchObject({ gross: 100, net: 90 });
  });
  it("net считается, если бэкенд его не вернул", () => {
    const rows = buildPrizeRows(1000, [100], 10, true, [{ place: 1, amount: 1000 }]);
    expect(rows[0].net).toBe(900);
  });
});
