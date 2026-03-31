import { makeAutoObservable, runInAction } from "mobx";
import { paymentApi } from "../services/apiService";
import { patchData } from "../services/apiService";
import type {
  Payment,
  Payout,
  WalletTransaction,
  Escrow,
  Milestone,
} from "../types";

export default class PaymentStore {
  payment: Payment | null = null;
  history: Payment[] = [];
  withdrawals: Payout[] = [];
  escrow: Escrow | null = null;
  milestones: Milestone[] = [];
  balance: number = 0;
  walletTransactions: WalletTransaction[] = [];
  loading: boolean = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async fetchBalance(): Promise<number> {
    try {
      const res = await paymentApi.get<{ balance?: number }>("/wallet/balance");
      runInAction(() => {
        this.balance = res.data.balance ?? 0;
      });
      return res.data.balance ?? 0;
    } catch {
      return 0;
    }
  }

  async fetchWalletPaymentStatus(payment_id: string): Promise<unknown> {
    try {
      const res = await paymentApi.get(`/wallet/payment/${payment_id}`);
      return res.data;
    } catch {
      return null;
    }
  }

  async topupWallet(amount: number): Promise<Payment> {
    this.loading = true;
    this.error = null;
    try {
      const res = await paymentApi.post<Payment>("/wallet/topup", { amount });
      if (res.data.status === "held") {
        await this.fetchBalance();
      }
      return res.data;
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка пополнения кошелька";
      });
      throw e;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchWalletTransactions(): Promise<void> {
    this.loading = true;
    try {
      const res = await paymentApi.get<WalletTransaction[]>(
        "/wallet/transactions",
      );
      runInAction(() => {
        this.walletTransactions = res.data;
      });
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка загрузки транзакций";
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async withdrawFromWallet(
    amount: number,
    card_number?: string | null,
    payout_type: string = "yoo_money",
    yoo_money_account?: string | null,
  ): Promise<Payout> {
    this.loading = true;
    this.error = null;
    try {
      const res = await paymentApi.post<Payout>("/wallet/withdraw", {
        amount,
        payout_type,
        card_number: card_number ?? undefined,
        yoo_money_account: yoo_money_account ?? undefined,
      });
      runInAction(() => {
        this.withdrawals = [res.data, ...this.withdrawals];
        this.balance = Math.max(0, this.balance - amount);
      });
      return res.data;
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка при выводе средств";
      });
      throw e;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async payContestFromBalance(
    contest_id: number,
    amount: number,
  ): Promise<Payment> {
    this.loading = true;
    this.error = null;
    try {
      const res = await paymentApi.post<Payment>("/payments/topup", {
        contest_id,
        amount,
        use_balance: true,
      });
      runInAction(() => {
        this.payment = res.data;
        this.balance = Math.max(0, this.balance - amount);
      });
      return res.data;
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка оплаты с баланса";
      });
      throw e;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async initPayment(contest_id: number, amount: number): Promise<Payment> {
    this.loading = true;
    this.error = null;
    try {
      const res = await paymentApi.post<Payment>("/payments/topup", {
        contest_id,
        amount,
      });
      runInAction(() => {
        this.payment = res.data;
      });
      return res.data;
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка при создании платежа";
      });
      throw e;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchPaymentStatus(contest_id: number): Promise<Payment | null> {
    try {
      const res = await paymentApi.get<Payment>(`/payments/${contest_id}`);
      runInAction(() => {
        this.payment = res.data;
      });
      return res.data;
    } catch {
      return null;
    }
  }

  async fetchHistory(): Promise<void> {
    this.loading = true;
    try {
      const res = await paymentApi.get<Payment[]>("/payments/history");
      runInAction(() => {
        this.history = res.data;
      });
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка загрузки истории";
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async refundWalletTopup(payment_id: string): Promise<unknown> {
    this.loading = true;
    this.error = null;
    try {
      const res = await paymentApi.post(`/wallet/topup/${payment_id}/refund`);
      return res.data;
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка при возврате пополнения";
      });
      throw e;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async refundPayment(contest_id: number): Promise<Payment> {
    this.loading = true;
    this.error = null;
    try {
      const res = await paymentApi.post<Payment>(
        `/payments/${contest_id}/refund`,
      );
      runInAction(() => {
        this.history = this.history.map((p) =>
          p.contest_id === contest_id ? res.data : p,
        );
      });
      return res.data;
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка при возврате";
      });
      throw e;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchWithdrawals(): Promise<void> {
    this.loading = true;
    try {
      const res = await paymentApi.get<Payout[]>("/payments/withdrawals/my");
      runInAction(() => {
        this.withdrawals = res.data;
      });
    } catch (e: unknown) {
      runInAction(() => {
        this.error =
          (e as { response?: { data?: { detail?: string } } }).response?.data
            ?.detail ?? "Ошибка загрузки выплат";
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchEscrow(contest_id: number): Promise<Escrow | null> {
    try {
      const res = await paymentApi.get<Escrow>(`/escrow/${contest_id}`);
      runInAction(() => {
        this.escrow = res.data;
      });
      return res.data;
    } catch {
      runInAction(() => {
        this.escrow = null;
      });
      return null;
    }
  }

  async fetchMilestones(contest_id: number): Promise<void> {
    try {
      const res = await paymentApi.get<Milestone[]>(
        `/escrow/${contest_id}/milestones`,
      );
      runInAction(() => {
        this.milestones = res.data;
      });
    } catch {
      runInAction(() => {
        this.milestones = [];
      });
    }
  }

  async activateContest(contest_id: number): Promise<boolean> {
    try {
      await patchData(`/contests/${contest_id}/activate`, {});
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.payment = null;
    this.error = null;
  }
}
