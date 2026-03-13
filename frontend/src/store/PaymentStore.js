import { makeAutoObservable, runInAction } from "mobx";
import { paymentApi } from "../services/apiService";

export default class PaymentStore {
    payment = null;           // current payment object
    history = [];             // customer contest payment history
    withdrawals = [];         // executor withdrawal/payout history
    escrow = null;            // escrow status for current contest
    milestones = [];          // milestone releases for current contest
    balance = 0;              // current user's wallet balance
    walletTransactions = [];  // wallet transaction history
    loading = false;
    error = null;

    constructor() {
        makeAutoObservable(this);
    }

    // ── Wallet balance ────────────────────────────────────────────────────────

    async fetchBalance() {
        try {
            const res = await paymentApi.get("/wallet/balance");
            runInAction(() => {
                this.balance = res.data.balance ?? 0;
            });
            return res.data.balance;
        } catch {
            return 0;
        }
    }

    async fetchWalletPaymentStatus(payment_id) {
        try {
            const res = await paymentApi.get(`/wallet/payment/${payment_id}`);
            return res.data;
        } catch {
            return null;
        }
    }

    async topupWallet(amount) {
        this.loading = true;
        this.error = null;
        try {
            const res = await paymentApi.post("/wallet/topup", { amount });
            // Stub mode: status already held — refresh balance
            if (res.data.status === "held") {
                await this.fetchBalance();
            }
            return res.data;
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка пополнения кошелька";
            });
            throw e;
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    async fetchWalletTransactions() {
        this.loading = true;
        try {
            const res = await paymentApi.get("/wallet/transactions");
            runInAction(() => {
                this.walletTransactions = res.data;
            });
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка загрузки транзакций";
            });
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    async withdrawFromWallet(amount, card_number) {
        this.loading = true;
        this.error = null;
        try {
            const res = await paymentApi.post("/wallet/withdraw", { amount, card_number });
            runInAction(() => {
                this.withdrawals = [res.data, ...this.withdrawals];
                this.balance = Math.max(0, this.balance - amount);
            });
            return res.data;
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка при выводе средств";
            });
            throw e;
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    // ── Customer: pay contest from wallet balance ──────────────────────────────

    async payContestFromBalance(contest_id, amount) {
        this.loading = true;
        this.error = null;
        try {
            const res = await paymentApi.post("/payments/topup", {
                contest_id,
                amount,
                use_balance: true,
            });
            runInAction(() => {
                this.payment = res.data;
                this.balance = Math.max(0, this.balance - amount);
            });
            return res.data;
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка оплаты с баланса";
            });
            throw e;
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    // ── Customer: create/init YooKassa payment ────────────────────────────────

    async initPayment(contest_id, amount) {
        this.loading = true;
        this.error = null;
        try {
            const res = await paymentApi.post("/payments/topup", { contest_id, amount });
            runInAction(() => {
                this.payment = res.data;
            });
            return res.data;
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка при создании платежа";
            });
            throw e;
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    // ── Poll payment status ────────────────────────────────────────────────────

    async fetchPaymentStatus(contest_id) {
        try {
            const res = await paymentApi.get(`/payments/${contest_id}`);
            runInAction(() => {
                this.payment = res.data;
            });
            return res.data;
        } catch {
            return null;
        }
    }

    // ── Customer: contest payment history ─────────────────────────────────────

    async fetchHistory() {
        this.loading = true;
        try {
            const res = await paymentApi.get("/payments/history");
            runInAction(() => {
                this.history = res.data;
            });
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка загрузки истории";
            });
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    // ── Executor: withdrawal history (legacy /payments/withdrawals/my) ─────────

    async fetchWithdrawals() {
        this.loading = true;
        try {
            const res = await paymentApi.get("/payments/withdrawals/my");
            runInAction(() => {
                this.withdrawals = res.data;
            });
        } catch (e) {
            runInAction(() => {
                this.error = e.response?.data?.detail || "Ошибка загрузки выплат";
            });
        } finally {
            runInAction(() => { this.loading = false; });
        }
    }

    // ── Escrow & milestones ───────────────────────────────────────────────────

    async fetchEscrow(contest_id) {
        try {
            const res = await paymentApi.get(`/escrow/${contest_id}`);
            runInAction(() => {
                this.escrow = res.data;
            });
            return res.data;
        } catch {
            runInAction(() => { this.escrow = null; });
            return null;
        }
    }

    async fetchMilestones(contest_id) {
        try {
            const res = await paymentApi.get(`/escrow/${contest_id}/milestones`);
            runInAction(() => {
                this.milestones = res.data;
            });
        } catch {
            runInAction(() => { this.milestones = []; });
        }
    }

    // ── Activate contest after payment ────────────────────────────────────────

    async activateContest(contest_id) {
        try {
            const { patchData } = await import("../services/apiService");
            await patchData(`/contests/${contest_id}/activate`, {});
            return true;
        } catch {
            return false;
        }
    }

    reset() {
        this.payment = null;
        this.error = null;
    }
}
