import { makeAutoObservable } from "mobx";
import { fetchData, updateData, patchData } from "../services/apiService";
import type { Contest, ContestStatus, ContestType, Statistics } from "../types";

interface FormField<T = string> {
  value: T;
  error: string;
  rules: { min?: number; max?: number; minDays?: number };
}

interface TypeField {
  value: number | null;
  error: string;
  rules: Record<string, never>;
}

interface FilesField {
  error: string;
  rules: { max: number };
  allowedTypes: string[];
}

interface ContestForm {
  type: TypeField;
  title: FormField;
  annotation: FormField;
  description: FormField;
  tz_text: FormField;
  prizepool: FormField;
  endBy: FormField;
  files: FilesField;
}

interface Stage {
  name: string;
  description: string;
  deadline: string;
  order: number;
  prize_amount: number;
}

type FilterParams = Record<string, string | number | undefined>;

const baseForm: ContestForm = {
  type: { value: null, error: "", rules: {} },
  title: { value: "", error: "", rules: { min: 10, max: 100 } },
  annotation: { value: "", error: "", rules: { min: 30, max: 200 } },
  description: { value: "", error: "", rules: { min: 100, max: 20000 } },
  tz_text: { value: "", error: "", rules: {} },
  prizepool: { value: "", error: "", rules: { min: 0, max: 9999999 } },
  endBy: { value: "", error: "", rules: { minDays: 3 } },
  files: {
    error: "",
    rules: { max: 20 },
    allowedTypes: [
      "application/zip",
      "application/x-zip-compressed",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
    ],
  },
};

export default class ContestStore {
  form: ContestForm = baseForm;
  stages: Stage[] = [];

  formErrors = {
    type: "Тип конкурса обязателен",
    title: `Название должно быть от ${baseForm.title.rules.min} до ${baseForm.title.rules.max} символов`,
    annotation: `Краткое описание от ${baseForm.annotation.rules.min} до ${baseForm.annotation.rules.max} символов`,
    description: `Полное описание от ${baseForm.description.rules.min} до ${baseForm.description.rules.max} символов`,
    prizepool: `Приз должен быть от ${baseForm.prizepool.rules.min} до ${baseForm.prizepool.rules.max}`,
    endBy: `Дата окончания минимум на ${baseForm.endBy.rules.minDays} дня позже текущей`,
    files: `Максимальное количество файлов - ${baseForm.files.rules.max}`,
  };

  status: Record<ContestStatus, string> = {
    draft: "Черновик",
    active: "Активный",
    finished: "Завершённый",
    cancelled: "Отменённый",
  };

  private _isAuth: boolean = false;
  private _types: ContestType[] = [];
  private _contests: Contest[] = [];
  private _currentContest: Contest | null = null;
  private _selectedTypes: ContestType[] = [];
  private _selectedStatuses: string[] = [];
  private _minReward: number = 0;
  private _maxReward: number = 9999999;
  private _endBy: Date | null = null;
  private _endAfter: Date | null = null;
  private _searchQuery: string = "";
  isLoading: boolean = false;
  private _employerId: number | null = null;
  private _lastFilterParams: FilterParams | null = null;
  private _sortBy: string = "created_at";
  private _sortDir: string = "desc";
  private _statistics: Statistics | null = null;
  currentPage: number = 1;
  totalPages: number = 1;

  constructor() {
    makeAutoObservable(this);
  }

  setStatistics(data: Statistics | null): void { this._statistics = data; }
  get statistics(): Statistics | null { return this._statistics; }

  setFormField(field: keyof ContestForm, value: string | number | null): void {
    (this.form[field] as { value: unknown }).value = value;
    this.validateField(field);
  }

  resetForm(): void {
    this.form = baseForm;
    this.stages = [];
  }

  // ── Stages management ──────────────────────────────────────────────────────

  addStage(): void {
    this.stages.push({
      name: "",
      description: "",
      deadline: "",
      order: this.stages.length + 1,
      prize_amount: 0,
    });
  }

  removeStage(index: number): void {
    this.stages.splice(index, 1);
    this.stages.forEach((s, i) => { s.order = i + 1; });
  }

  updateStage(index: number, field: keyof Stage, value: string | number): void {
    (this.stages[index] as Record<string, unknown>)[field] = value;
  }

  // ──────────────────────────────────────────────────────────────────────────

  validateField(field: keyof ContestForm): void {
    switch (field) {
      case "title": {
        const f = this.form.title;
        f.error = !(f.value.length >= (f.rules.min ?? 0) && f.value.length <= (f.rules.max ?? Infinity))
          ? this.formErrors.title : "";
        break;
      }
      case "annotation": {
        const f = this.form.annotation;
        f.error = !(f.value.length >= (f.rules.min ?? 0) && f.value.length <= (f.rules.max ?? Infinity))
          ? this.formErrors.annotation : "";
        break;
      }
      case "description": {
        const f = this.form.description;
        f.error = !(f.value.length >= (f.rules.min ?? 0) && f.value.length <= (f.rules.max ?? Infinity))
          ? this.formErrors.description : "";
        break;
      }
      case "prizepool": {
        const val = parseInt(this.form.prizepool.value);
        this.form.prizepool.error = !(val >= (this.form.prizepool.rules.min ?? 0) && val <= (this.form.prizepool.rules.max ?? Infinity))
          ? this.formErrors.prizepool : "";
        break;
      }
      case "endBy": {
        let selectedDate = new Date(this.form.endBy.value);
        if (!this.form.endBy.value) selectedDate = new Date("1970-01-01");
        const minValidDate = new Date();
        minValidDate.setDate(minValidDate.getDate() + (this.form.endBy.rules.minDays ?? 3));
        if (selectedDate < minValidDate) {
          this.form.endBy.error = this.formErrors.endBy;
        } else {
          this.form.endBy.error = "";
          this.form.endBy.value = selectedDate.toISOString().split("T")[0];
        }
        break;
      }
      case "type":
        this.form.type.error = this.form.type.value ? "" : this.formErrors.type;
        break;
    }
  }

  validateForm(): boolean {
    (Object.keys(this.form) as Array<keyof ContestForm>).forEach((field) => this.validateField(field));
    return !(Object.values(this.form) as Array<{ error?: string }>).some((field) => field.error !== "");
  }

  setLoading(bool: boolean): void { this.isLoading = bool; }
  setEmployerId(id: number | null): void { this._employerId = id; }
  get employerId(): number | null { return this._employerId; }

  setIsAuth(bool: boolean): void { this._isAuth = bool; }
  setTypes(types: ContestType[]): void { this._types = types; }
  setContests(contest: Contest[]): void { this._contests = contest; }
  setTotalPages(totalPages: number): void { this.totalPages = totalPages; }
  setCurrentPage(currentPage: number): void { this.currentPage = currentPage; }
  setCurrentContest(contest: Contest | null): void { this._currentContest = contest; }
  setSelectedTypes(types: ContestType[]): void { this._selectedTypes = types; }
  setSelectedStatuses(statuses: string[]): void { this._selectedStatuses = statuses; }
  setSearchQuery(query: string): void { this._searchQuery = query; }

  getStatus(status: ContestStatus): string { return this.status[status]; }

  setMinReward(min: number): void { this._minReward = min; }
  setMaxReward(max: number): void { this._maxReward = max; }
  setReward({ min, max }: { min: number; max: number }): void {
    this.setMinReward(min);
    this.setMaxReward(max);
  }

  setSortBy(val: string): void { this._sortBy = val; this._lastFilterParams = null; }
  setSortDir(val: string): void { this._sortDir = val; this._lastFilterParams = null; }
  get sortBy(): string { return this._sortBy; }
  get sortDir(): string { return this._sortDir; }

  setEndBy(date: string | Date | null | undefined): void {
    if (!date) { this._endBy = null; return; }
    this._endBy = new Date(date);
  }

  setEndAfter(date: string | Date | null | undefined): void {
    if (!date) { this._endAfter = null; return; }
    this._endAfter = new Date(date);
  }

  get minReward(): number { return this._minReward; }
  get maxReward(): number { return this._maxReward; }
  get isAuth(): boolean { return this._isAuth; }
  get types(): ContestType[] { return this._types; }
  get contests(): Contest[] { return this._contests; }
  get currentContest(): Contest | null { return this._currentContest; }
  get selectedTypes(): ContestType[] { return this._selectedTypes; }
  get selectedStatuses(): string[] { return this._selectedStatuses; }
  get searchQuery(): string { return this._searchQuery; }
  get endBy(): Date | null { return this._endBy; }
  get endAfter(): Date | null { return this._endAfter; }

  async fetchContests(): Promise<void> {
    try {
      const data = await fetchData<{ items: Contest[]; pages: number }>("/contests");
      this.setContests(data.items || []);
    } catch (error) {
      console.error("Ошибка при отправке:", error);
    } finally {
      this.setLoading(false);
    }
  }

  async fetchContestsByPage(page: number): Promise<void> {
    try {
      this.setLoading(true);
      const data = await fetchData<{ items: Contest[]; pages: number }>("/contests", { page });
      this.setContests(data.items || []);
      this.setTotalPages(data.pages || 1);
      this.setCurrentPage(page);
    } catch (error) {
      console.error("Ошибка при отправке:", error);
    } finally {
      this.setLoading(false);
    }
  }

  hasFiltersChanged(params: FilterParams): boolean {
    if (!this._lastFilterParams) return true;
    return JSON.stringify(params) !== JSON.stringify(this._lastFilterParams);
  }

  getFiltersAndParams(): FilterParams {
    const params: FilterParams = {
      minReward: this._minReward !== undefined && this._minReward !== null ? this._minReward : 0,
      maxReward: this._maxReward !== undefined && this._maxReward !== null ? this._maxReward : 9999999,
    };

    if (this._selectedTypes?.length > 0)
      params.types = this._selectedTypes.map((t) => t.id).join(",");
    if (this._selectedStatuses?.length > 0)
      params.statuses = this._selectedStatuses.join(",");
    if (this._searchQuery)
      params.search = this._searchQuery;
    if (this._endBy)
      params.endBy = this._endBy.toISOString().split("T")[0];
    if (this._endAfter)
      params.endAfter = this._endAfter.toISOString().split("T")[0];
    if (this._employerId)
      params.employerId = this._employerId;

    return params;
  }

  async fetchContestsFiltered(page: number = 1): Promise<void> {
    const rawParams = this.getFiltersAndParams();
    const params: FilterParams = { page };
    if (rawParams.search) params.search = rawParams.search;
    if (rawParams.statuses) params.statuses = rawParams.statuses;
    if (rawParams.types) params.types = rawParams.types;
    if ((rawParams.minReward as number) !== 0) params.min_reward = rawParams.minReward;
    if ((rawParams.maxReward as number) !== 9999999) params.max_reward = rawParams.maxReward;
    if (rawParams.employerId) params.customer_id = rawParams.employerId;
    if (rawParams.endBy) params.endBy = rawParams.endBy;
    if (rawParams.endAfter) params.endAfter = rawParams.endAfter;
    params.sort_by = this._sortBy;
    params.sort_dir = this._sortDir;

    if (!this.hasFiltersChanged(params) && page === this.currentPage && this._contests.length > 0)
      return;

    try {
      this.setLoading(true);
      const data = await fetchData<{ items: Contest[]; pages: number }>("/contests", params as Record<string, unknown>);
      this.setContests(data.items || []);
      this.setTotalPages(data.pages || 1);
      this.setCurrentPage(page);
      this._lastFilterParams = params;
    } catch (error) {
      console.error("Ошибка при отправке:", error);
    } finally {
      this.setLoading(false);
    }
  }

  async fetchOneContestById(id: number): Promise<Contest | null> {
    try {
      return await fetchData<Contest>(`/contests/${id}`, {}, { silent: true });
    } catch {
      return null;
    }
  }

  // Alias used by PaymentCheckoutPage / PaymentCallbackPage
  async fetchOneContest(id: number): Promise<Contest | null> {
    return this.fetchOneContestById(id);
  }

  async fetchOneContestByNumber(number: number | string): Promise<Contest | null> {
    try {
      return await fetchData<Contest>(`/contests/number/${number}`);
    } catch (error) {
      console.error("Ошибка при загрузке конкурса:", error);
      return null;
    }
  }

  async fetchTypes(): Promise<void> {
    try {
      const types = await fetchData<ContestType[]>("/contest-types");
      this.setTypes(types);
    } catch (error) {
      console.error("Ошибка при загрузке типов конкурсов:", error);
    }
  }

  getTypeNameById(typeId: number | null | undefined): string | null {
    if (!typeId) return null;
    const type = this._types.find((t) => t.id === typeId);
    return type?.name ?? "Неизвестный тип";
  }

  resetFilters(): void {
    this._selectedTypes = [];
    this._selectedStatuses = [];
    this._minReward = 0;
    this._maxReward = 9999999;
    this._endBy = null;
    this._endAfter = null;
    this._searchQuery = "";
    this._sortBy = "created_at";
    this._sortDir = "desc";
    void this.fetchContestsFiltered();
  }

  async updateStages(contestId: number, stages: Stage[]): Promise<Contest> {
    return updateData<Contest>(`/contests/${contestId}/stages`, stages);
  }

  async setCurrentStage(contestId: number, stageId: number | null): Promise<Contest> {
    const url = stageId != null
      ? `/contests/${contestId}/current-stage?stage_id=${stageId}`
      : `/contests/${contestId}/current-stage`;
    return patchData<Contest>(url, {});
  }

  async fetchStatistics(x: string = "type", y: string = "count"): Promise<void> {
    try {
      const data = await fetchData<Statistics>("/statistics", { x, y });
      this.setStatistics(data);
    } catch (error) {
      console.error("fetchStatistics error:", error);
    }
  }
}
