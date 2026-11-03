export type UserRole = "customer" | "executor" | "admin";
export type ContestStatus = "draft" | "active" | "finished" | "cancelled";
export type SortDir = "asc" | "desc";

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

export interface RequirementResult {
  text: string;
  score: number;
  comment: string;
  is_critical: boolean;
}

export interface EvaluationResult {
  submission_id: number;
  contest_id: number;
  compliance_score: number;
  passed_requirements: string[];
  failed_requirements: string[];
  requirements_detail: RequirementResult[];
  critical_issues: boolean;
  created_at: string;
}

export interface RequirementItem {
  text: string;
  is_critical: boolean;
}

export interface ContestRequirementsOut {
  contest_id: number;
  requirements: RequirementItem[];
  cached_at: string;
}

export interface ContestStatsOut {
  contest_id: number;
  evaluated_count: number;
  avg_score: number | null;
  critical_issues_count: number;
}

export interface WalletBalance {
  balance: number;
  currency: string;
}

export interface WalletTransaction {
  id: number;
  type: "topup" | "contest_payment" | "income" | "withdrawal";
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

export interface StatisticsDataset {
  label: string;
  data: number[];
}

export interface Statistics {
  x_labels: string[];
  datasets: StatisticsDataset[];
}

import type UserStore from "../store/UserStore";
import type ContestStore from "../store/ContestStore";
import type SolutionStore from "../store/SolutionStore";
import type PaymentStore from "../store/PaymentStore";
import type ChatStore from "../store/ChatStore";
import type NotificationStore from "../store/NotificationStore";

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  text: string;
  created_at: string;
  read_at: string | null;
  /** Только на клиенте: сообщение ещё отправляется или отправка не удалась. */
  status?: "sending" | "error";
}

export interface ChatLastMessage {
  id: number;
  sender_id: number;
  text: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  contest_id: number;
  customer_id: number;
  executor_id: number;
  created_at: string;
  last_message_at: string | null;
  contest_title: string | null;
  contest_number: number | null;
  other_user_id: number | null;
  other_user_login: string | null;
  last_message: ChatLastMessage | null;
  unread_count: number;
}

export interface StoreContext {
  user: UserStore;
  contest: ContestStore;
  solution: SolutionStore;
  payment: PaymentStore;
  chat: ChatStore;
  notifications: NotificationStore;
}
