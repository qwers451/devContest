// ── Domain types ──────────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'executor' | 'admin';
export type ContestStatus = 'draft' | 'active' | 'finished' | 'cancelled';
export type SortDir = 'asc' | 'desc';

export interface User {
  id: number;
  email: string;
  login: string;
  role: UserRole;
  status: number;
  created_at: string;
}

export interface ContestType {
  id: number;
  name: string;
}

export interface ContestStage {
  id?: number;
  name: string;
  description?: string;
  deadline?: string;
  order: number;
  prize_amount?: number;
}

export interface Contest {
  id: number;
  number: number;
  title: string;
  annotation?: string;
  description?: string;
  tz_text?: string;
  prizepool: number;
  ends_at: string;
  status: ContestStatus;
  type_id?: number;
  customer_id: number;
  current_stage_id?: number | null;
  stages: ContestStage[];
  created_at: string;
  updated_at: string;
}

export interface ContestListResponse {
  items: Contest[];
  total: number;
  page: number;
  pages: number;
}

export interface Submission {
  id: number;
  number: number;
  contest_id: number;
  executor_id: number;
  title: string;
  annotation?: string;
  description?: string;
  status: number;
  files: string[];
  ai_score?: number | null;
  critical_issues?: boolean | null;
  avg_score?: number | null;
  created_at: string;
  updated_at: string;
  executor_login?: string;
  contest_title?: string;
}

export interface Review {
  id: number;
  submission_id: number;
  number: number;
  score: number;
  commentary?: string;
  created_at: string;
}

export interface EvaluationResult {
  submission_id: number;
  contest_id: number;
  compliance_score: number;
  passed_requirements: string[];
  failed_requirements: string[];
  critical_issues: boolean;
  created_at: string;
}

// ── Payment types ─────────────────────────────────────────────────────────────

export interface WalletBalance {
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  id: number;
  type: 'topup' | 'contest_payment' | 'income' | 'withdrawal';
  amount: number;
  description?: string;
  created_at: string;
}

export interface Payment {
  id: number;
  contest_id?: number;
  amount: number;
  status: string;
  payment_id?: string;
  redirect_url?: string;
  created_at: string;
}

export interface Payout {
  id: number;
  amount: number;
  status: string;
  created_at: string;
}

export interface Escrow {
  id: number;
  contest_id: number;
  customer_id: number;
  amount: number;
  status: string;
}

export interface Milestone {
  id: number;
  contest_id: number;
  stage_id: number;
  executor_id: number;
  amount: number;
  released: boolean;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface StatisticsDataset {
  label: string;
  data: number[];
}

export interface Statistics {
  x_labels: string[];
  datasets: StatisticsDataset[];
}

// ── Store context type ────────────────────────────────────────────────────────

import type UserStore from '../store/UserStore';
import type ContestStore from '../store/ContestStore';
import type SolutionStore from '../store/SolutionStore';
import type PaymentStore from '../store/PaymentStore';

export interface StoreContext {
  user: UserStore;
  contest: ContestStore;
  solution: SolutionStore;
  payment: PaymentStore;
}
