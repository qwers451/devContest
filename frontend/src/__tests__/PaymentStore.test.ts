import { describe, it, expect, beforeEach, vi } from "vitest";
import * as api from "../services/apiService";
import PaymentStore from "../store/PaymentStore";

let store: PaymentStore;

beforeEach(() => {
  store = new PaymentStore();
  vi.clearAllMocks();
});


describe("Конструктор PaymentStore", () => {
  it("начальные значения по умолчанию", () => {
    expect(store.payment).toBeNull();
    expect(store.history).toEqual([]);
    expect(store.withdrawals).toEqual([]);
    expect(store.escrow).toBeNull();
    expect(store.milestones).toEqual([]);
    expect(store.balance).toBe(0);
    expect(store.walletTransactions).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });
});


describe("reset", () => {
  it("сбрасывает payment и error", () => {
    store.payment = { id: 1 };
    store.error = "some error";
    store.reset();
    expect(store.payment).toBeNull();
    expect(store.error).toBeNull();
  });

  it("не трогает balance и history", () => {
    store.balance = 500;
    store.history = [{ id: 1 }];
    store.reset();
    expect(store.balance).toBe(500);
    expect(store.history).toEqual([{ id: 1 }]);
  });
});


describe("fetchBalance", () => {
  it("загружает баланс и сохраняет в store", async () => {
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: { balance: 1500 } });
    const result = await store.fetchBalance();
    expect(api.paymentApi.get).toHaveBeenCalledWith("/wallet/balance");
    expect(result).toBe(1500);
    expect(store.balance).toBe(1500);
  });

  it("использует 0 в store если balance отсутствует в ответе", async () => {
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: {} });
    await store.fetchBalance();
    expect(store.balance).toBe(0);
  });

  it("при ошибке возвращает 0 и не падает", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Network error"));
    const result = await store.fetchBalance();
    expect(result).toBe(0);
  });
});


describe("fetchWalletPaymentStatus", () => {
  it("возвращает данные платежа", async () => {
    const data = { payment_id: "abc", status: "succeeded", amount: 100 };
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data });
    const result = await store.fetchWalletPaymentStatus("abc");
    expect(api.paymentApi.get).toHaveBeenCalledWith("/wallet/payment/abc");
    expect(result).toEqual(data);
  });

  it("при ошибке возвращает null", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Not found"));
    const result = await store.fetchWalletPaymentStatus("bad");
    expect(result).toBeNull();
  });
});


describe("topupWallet", () => {
  it("вызывает POST /wallet/topup и возвращает данные", async () => {
    const data = { payment_id: "p1", status: "pending", amount: 500 };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data });
    const result = await store.topupWallet(500);
    expect(api.paymentApi.post).toHaveBeenCalledWith("/wallet/topup", { amount: 500 });
    expect(result).toEqual(data);
    expect(store.loading).toBe(false);
  });

  it("при status=held вызывает fetchBalance", async () => {
    const data = { payment_id: "p2", status: "held", amount: 200 };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data });
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: { balance: 200 } });
    await store.topupWallet(200);
    expect(api.paymentApi.get).toHaveBeenCalledWith("/wallet/balance");
  });

  it("при ошибке устанавливает error из detail и бросает исключение", async () => {
    const err = { response: { data: { detail: "Insufficient funds" } } };
    vi.mocked(api.paymentApi.post).mockRejectedValue(err);
    await expect(store.topupWallet(9999)).rejects.toEqual(err);
    expect(store.error).toBe("Insufficient funds");
    expect(store.loading).toBe(false);
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue(new Error("Network"));
    await expect(store.topupWallet(100)).rejects.toThrow();
    expect(store.error).toBe("Ошибка пополнения кошелька");
  });
});


describe("fetchWalletTransactions", () => {
  it("загружает транзакции", async () => {
    const txs = [{ id: 1, type: "topup", amount: 100 }];
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: txs });
    await store.fetchWalletTransactions();
    expect(api.paymentApi.get).toHaveBeenCalledWith("/wallet/transactions");
    expect(store.walletTransactions).toEqual(txs);
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue({ response: { data: { detail: "Forbidden" } } });
    await store.fetchWalletTransactions();
    expect(store.error).toBe("Forbidden");
    expect(store.loading).toBe(false);
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Network"));
    await store.fetchWalletTransactions();
    expect(store.error).toBe("Ошибка загрузки транзакций");
  });
});


describe("withdrawFromWallet", () => {
  it("выводит средства и обновляет баланс", async () => {
    store.balance = 1000;
    const payout = { id: 1, amount: 300, status: "pending" };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data: payout });
    const result = await store.withdrawFromWallet(300, "4111111111111111");
    expect(api.paymentApi.post).toHaveBeenCalledWith("/wallet/withdraw", {
      amount: 300,
      card_number: "4111111111111111",
    });
    expect(result).toEqual(payout);
    expect(store.balance).toBe(700);
    expect(store.withdrawals[0]).toEqual(payout);
    expect(store.loading).toBe(false);
  });

  it("баланс не уходит ниже 0", async () => {
    store.balance = 100;
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data: { id: 2 } });
    await store.withdrawFromWallet(500);
    expect(store.balance).toBe(0);
  });

  it("при ошибке устанавливает error и бросает исключение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue({ response: { data: { detail: "Not enough" } } });
    await expect(store.withdrawFromWallet(99999)).rejects.toBeDefined();
    expect(store.error).toBe("Not enough");
    expect(store.loading).toBe(false);
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue(new Error("Network"));
    await expect(store.withdrawFromWallet(100)).rejects.toThrow();
    expect(store.error).toBe("Ошибка при выводе средств");
  });
});


describe("payContestFromBalance", () => {
  it("оплачивает конкурс с баланса и обновляет payment и balance", async () => {
    store.balance = 5000;
    const paymentData = { id: 10, contest_id: 42, amount: 3000, status: "held" };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data: paymentData });
    const result = await store.payContestFromBalance(42, 3000);
    expect(api.paymentApi.post).toHaveBeenCalledWith("/payments/topup", {
      contest_id: 42,
      amount: 3000,
      use_balance: true,
    });
    expect(result).toEqual(paymentData);
    expect(store.payment).toEqual(paymentData);
    expect(store.balance).toBe(2000);
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error и бросает", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue({ response: { data: { detail: "Low balance" } } });
    await expect(store.payContestFromBalance(1, 999)).rejects.toBeDefined();
    expect(store.error).toBe("Low balance");
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue(new Error("Network"));
    await expect(store.payContestFromBalance(1, 100)).rejects.toThrow();
    expect(store.error).toBe("Ошибка оплаты с баланса");
  });
});


describe("initPayment", () => {
  it("инициирует платёж YooKassa и сохраняет в payment", async () => {
    const paymentData = { id: 5, redirect_url: "https://yookassa.ru/...", status: "pending" };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data: paymentData });
    const result = await store.initPayment(7, 2000);
    expect(api.paymentApi.post).toHaveBeenCalledWith("/payments/topup", {
      contest_id: 7,
      amount: 2000,
    });
    expect(result).toEqual(paymentData);
    expect(store.payment).toEqual(paymentData);
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error и бросает", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue({ response: { data: { detail: "Invalid amount" } } });
    await expect(store.initPayment(1, -1)).rejects.toBeDefined();
    expect(store.error).toBe("Invalid amount");
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue(new Error("Network"));
    await expect(store.initPayment(1, 100)).rejects.toThrow();
    expect(store.error).toBe("Ошибка при создании платежа");
  });
});


describe("fetchPaymentStatus", () => {
  it("получает статус платежа и обновляет store", async () => {
    const data = { id: 3, status: "held", amount: 1000 };
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data });
    const result = await store.fetchPaymentStatus(3);
    expect(api.paymentApi.get).toHaveBeenCalledWith("/payments/3");
    expect(result).toEqual(data);
    expect(store.payment).toEqual(data);
  });

  it("при ошибке возвращает null", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Not found"));
    const result = await store.fetchPaymentStatus(999);
    expect(result).toBeNull();
  });
});


describe("fetchHistory", () => {
  it("загружает историю платежей", async () => {
    const list = [{ id: 1, contest_id: 10, amount: 500 }];
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: list });
    await store.fetchHistory();
    expect(api.paymentApi.get).toHaveBeenCalledWith("/payments/history");
    expect(store.history).toEqual(list);
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue({ response: { data: { detail: "Forbidden" } } });
    await store.fetchHistory();
    expect(store.error).toBe("Forbidden");
    expect(store.loading).toBe(false);
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Network"));
    await store.fetchHistory();
    expect(store.error).toBe("Ошибка загрузки истории");
  });
});


describe("refundWalletTopup", () => {
  it("выполняет возврат пополнения кошелька", async () => {
    const data = { payment_id: "p1", status: "refunded" };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data });
    const result = await store.refundWalletTopup("p1");
    expect(api.paymentApi.post).toHaveBeenCalledWith("/wallet/topup/p1/refund");
    expect(result).toEqual(data);
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error и бросает", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue({ response: { data: { detail: "Already refunded" } } });
    await expect(store.refundWalletTopup("p2")).rejects.toBeDefined();
    expect(store.error).toBe("Already refunded");
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue(new Error("Network"));
    await expect(store.refundWalletTopup("p3")).rejects.toThrow();
    expect(store.error).toBe("Ошибка при возврате пополнения");
  });
});


describe("refundPayment", () => {
  it("возвращает платёж и обновляет history", async () => {
    store.history = [
      { id: 1, contest_id: 5, amount: 1000, status: "held" },
      { id: 2, contest_id: 6, amount: 2000, status: "held" },
    ];
    const updated = { id: 1, contest_id: 5, amount: 1000, status: "refunded" };
    vi.mocked(api.paymentApi.post).mockResolvedValue({ data: updated });
    const result = await store.refundPayment(5);
    expect(api.paymentApi.post).toHaveBeenCalledWith("/payments/5/refund");
    expect(result).toEqual(updated);
    expect(store.history[0].status).toBe("refunded");
    expect(store.history[1].status).toBe("held");
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error и бросает", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue({ response: { data: { detail: "Cannot refund" } } });
    await expect(store.refundPayment(99)).rejects.toBeDefined();
    expect(store.error).toBe("Cannot refund");
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.post).mockRejectedValue(new Error("Network"));
    await expect(store.refundPayment(1)).rejects.toThrow();
    expect(store.error).toBe("Ошибка при возврате");
  });
});


describe("fetchWithdrawals", () => {
  it("загружает список выплат исполнителя", async () => {
    const list = [{ id: 1, amount: 500, status: "succeeded" }];
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: list });
    await store.fetchWithdrawals();
    expect(api.paymentApi.get).toHaveBeenCalledWith("/payments/withdrawals/my");
    expect(store.withdrawals).toEqual(list);
    expect(store.loading).toBe(false);
  });

  it("при ошибке устанавливает error", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue({ response: { data: { detail: "Not found" } } });
    await store.fetchWithdrawals();
    expect(store.error).toBe("Not found");
    expect(store.loading).toBe(false);
  });

  it("при ошибке без detail использует запасное сообщение", async () => {
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Network"));
    await store.fetchWithdrawals();
    expect(store.error).toBe("Ошибка загрузки выплат");
  });
});


describe("fetchEscrow", () => {
  it("загружает эскроу и сохраняет в store", async () => {
    const data = { id: 1, contest_id: 10, amount: 5000, status: "held" };
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data });
    const result = await store.fetchEscrow(10);
    expect(api.paymentApi.get).toHaveBeenCalledWith("/escrow/10");
    expect(result).toEqual(data);
    expect(store.escrow).toEqual(data);
  });

  it("при ошибке возвращает null и сбрасывает escrow", async () => {
    store.escrow = { id: 1 };
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Not found"));
    const result = await store.fetchEscrow(999);
    expect(result).toBeNull();
    expect(store.escrow).toBeNull();
  });
});


describe("fetchMilestones", () => {
  it("загружает вехи эскроу", async () => {
    const list = [{ id: 1, amount: 1000, released: false }];
    vi.mocked(api.paymentApi.get).mockResolvedValue({ data: list });
    await store.fetchMilestones(10);
    expect(api.paymentApi.get).toHaveBeenCalledWith("/escrow/10/milestones");
    expect(store.milestones).toEqual(list);
  });

  it("при ошибке сбрасывает milestones в []", async () => {
    store.milestones = [{ id: 1 }];
    vi.mocked(api.paymentApi.get).mockRejectedValue(new Error("Not found"));
    await store.fetchMilestones(999);
    expect(store.milestones).toEqual([]);
  });
});


describe("activateContest", () => {
  it("активирует конкурс и возвращает true", async () => {
    vi.mocked(api.patchData).mockResolvedValue({});
    const result = await store.activateContest(5);
    expect(result).toBe(true);
  });

  it("при ошибке возвращает false", async () => {
    vi.mocked(api.patchData).mockRejectedValue(new Error("Forbidden"));
    const result = await store.activateContest(999);
    expect(result).toBe(false);
  });
});
