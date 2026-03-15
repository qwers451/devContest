import { makeAutoObservable, runInAction } from "mobx";
import {
  fetchData,
  fetchDataRaw,
  deleteData,
  patchData,
  sendData,
} from "../services/apiService";
import type { Submission, EvaluationResult } from "../types";

interface FormField<T = string> {
  value: T;
  error: string;
  rules: { min?: number; max?: number };
}

interface FilesField {
  error: string;
  rules: { max: number };
  allowedTypes: string[];
}

interface SolutionForm {
  title: FormField;
  annotation: FormField;
  description: FormField;
  files: FilesField;
}

interface StatusInfo {
  label: string;
  color: string;
  textColor: string;
}

const baseForm: SolutionForm = {
  title: { value: "", error: "", rules: { min: 10, max: 100 } },
  annotation: { value: "", error: "", rules: { min: 30, max: 200 } },
  description: { value: "", error: "", rules: { min: 100, max: 20000 } },
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
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
};

type FilterParams = Record<string, string | number | undefined>;

export default class SolutionStore {
  form: SolutionForm = baseForm;

  formErrors = {
    title: `Название должно быть от ${baseForm.title.rules.min} до ${baseForm.title.rules.max} символов`,
    annotation: `Аннотация должна быть от ${baseForm.annotation.rules.min} до ${baseForm.annotation.rules.max} символов`,
    description: `Описание должно быть от ${baseForm.description.rules.min} до ${baseForm.description.rules.max} символов`,
    files: `Максимальное количество файлов - ${baseForm.files.rules.max}`,
  };

  statusMap: Record<number, StatusInfo> = {
    1: { label: "Новое",              color: "#87cefa", textColor: "#000" },
    2: { label: "Просмотрено",        color: "#99ff99", textColor: "#000" },
    3: { label: "Победитель",         color: "#008000", textColor: "#000" },
    4: { label: "Необходимы правки",  color: "#f3a505", textColor: "#000" },
    5: { label: "Правки внесены",     color: "#87cefa", textColor: "#000" },
  };

  private _solutions: Submission[] = [];
  private _currentSolution: Submission | null = null;
  private _searchQuery: string = "";
  private _selectedStatuses: number[] = [];
  private _addedBefore: Date | null = null;
  private _addedAfter: Date | null = null;
  private _freelancerId: number | null = null;
  private _contestId: number | null = null;
  isLoading: boolean = true;
  private _lastFilterParams: FilterParams | null = null;
  private _searchForMySolutions: boolean | null = null;
  evaluation: EvaluationResult | null = null;
  evaluationLoading: boolean = false;
  evaluationUnavailable: boolean = false;
  private _page: number = 1;
  private _limit: number = 2;
  private _totalCount: number = 0;
  private _sortBy: string = "created_at";
  private _sortDir: string = "desc";

  constructor() {
    makeAutoObservable(this);
  }

  setSolutions(solutions: Submission[]): void { this._solutions = solutions; }
  setCurrentSolution(solution: Submission | null): void { this._currentSolution = solution; }
  setSearchQuery(query: string, searchForMySolutions?: boolean | null): void {
    this._searchQuery = query;
    this._searchForMySolutions = searchForMySolutions ?? null;
  }
  setSelectedStatuses(statuses: number[]): void { this._selectedStatuses = statuses; }

  setAddedBefore(date: string | Date | null | undefined): void {
    if (!date) { this._addedBefore = null; return; }
    this._addedBefore = new Date(date);
  }

  setAddedAfter(date: string | Date | null | undefined): void {
    if (!date) { this._addedAfter = null; return; }
    this._addedAfter = new Date(date);
  }

  setFreelancerId(id: number | null): void { this._freelancerId = id; this._lastFilterParams = null; }
  setContestId(id: number | null): void { this._contestId = id; this._lastFilterParams = null; }
  setLoading(bool: boolean): void { this.isLoading = bool; }
  setPage(page: number): void { this._page = page; }
  setLimit(limit: number): void { this._limit = limit; }

  get solutions(): Submission[] { return this._solutions; }
  get currentSolution(): Submission | null { return this._currentSolution; }
  get searchQuery(): string { return this._searchQuery; }
  get selectedStatuses(): number[] { return this._selectedStatuses; }
  get addedBefore(): Date | null { return this._addedBefore; }
  get addedAfter(): Date | null { return this._addedAfter; }
  get freelancerId(): number | null { return this._freelancerId; }
  get contestId(): number | null { return this._contestId; }
  get page(): number { return this._page; }
  get limit(): number { return this._limit; }
  get totalCount(): number { return this._totalCount; }
  setSortBy(val: string): void { this._sortBy = val; this._lastFilterParams = null; }
  setSortDir(val: string): void { this._sortDir = val; this._lastFilterParams = null; }
  get sortBy(): string { return this._sortBy; }
  get sortDir(): string { return this._sortDir; }

  get statusOptions(): Array<{ value: number; label: string; color: string; textColor: string }> {
    return Object.entries(this.statusMap).map(([value, data]) => ({
      value: parseInt(value),
      label: data.label,
      color: data.color,
      textColor: data.textColor,
    }));
  }

  hasFiltersChanged(params: FilterParams): boolean {
    if (!this._lastFilterParams) return true;
    return JSON.stringify(params) !== JSON.stringify(this._lastFilterParams);
  }

  async fetchSolutionsFiltered(): Promise<void> {
    try {
      const params: FilterParams = { page: this._page, limit: this._limit };

      if (this._freelancerId) params.executor_id = this._freelancerId;
      if (this._contestId) params.contest_id = this._contestId;
      if (this._selectedStatuses?.length > 0)
        params.statuses = this._selectedStatuses.join(",");
      if (this._addedBefore)
        params.addedBefore = this._addedBefore.toISOString().split("T")[0];
      if (this._addedAfter)
        params.addedAfter = this._addedAfter.toISOString().split("T")[0];
      params.sort_by = this._sortBy;
      params.sort_dir = this._sortDir;

      if (!this.hasFiltersChanged(params) && this._solutions.length > 0) {
        console.log("Using cached solutions");
        this.setLoading(false);
        return;
      }

      this.setLoading(true);
      console.log("Fetching submissions with params:", params);

      const response = await fetchData<Submission[]>("/submissions", params as Record<string, unknown>);
      const list = Array.isArray(response) ? response : [];
      this.setSolutions(list);
      this._totalCount = list.length;
      this._lastFilterParams = params;
    } catch (error) {
      console.error("Ошибка при отправке:", error);
    } finally {
      this.setLoading(false);
    }
  }

  resetFilters(): void {
    this._searchQuery = "";
    this._searchForMySolutions = null;
    this._selectedStatuses = [];
    this._addedBefore = null;
    this._addedAfter = null;
    this._sortBy = "created_at";
    this._sortDir = "desc";
    void this.fetchSolutionsFiltered();
  }

  getStatus(number: number): StatusInfo {
    return this.statusMap[number] ?? { label: "Неизвестно", color: "dark", textColor: "#fff" };
  }

  setFormField(field: keyof SolutionForm, value: string): void {
    (this.form[field] as FormField).value = value;
    this.validateField(field);
  }

  resetForm(): void { this.form = baseForm; }

  validateField(field: keyof SolutionForm): void {
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
    }
  }

  validateForm(): boolean {
    (Object.keys(this.form) as Array<keyof SolutionForm>).forEach((field) => this.validateField(field));
    return !(Object.values(this.form) as Array<{ error?: string }>).some((field) => field.error !== "" && field.error !== undefined);
  }

  _updateLocalSolution(updatedSolution: Submission): void {
    const index = this._solutions.findIndex((s) => s.id === updatedSolution.id);
    if (index !== -1) {
      this._solutions[index] = { ...updatedSolution };
    }
    if (this._currentSolution?.id === updatedSolution.id) {
      this._currentSolution = { ...updatedSolution };
    }
  }

  async updateSolutionStatus(solutionId: number, newStatus: number): Promise<Submission> {
    try {
      const validStatuses = Object.keys(this.statusMap).map(Number);
      const minStatus = Math.min(...validStatuses);
      const maxStatus = Math.max(...validStatuses);
      if (typeof newStatus !== "number" || !validStatuses.includes(newStatus)) {
        throw new Error(`Статус должен быть числом от ${minStatus} до ${maxStatus}`);
      }
      const response = await patchData<Submission>(
        `/submissions/${solutionId}/status`,
        {},
        { status: newStatus },
      );
      this._updateLocalSolution(response);
      return response;
    } catch (error) {
      console.error("Ошибка обновления статуса:", error);
      throw error;
    }
  }

  getSolutionIfExists(number: number | string): Submission | null {
    if (this.currentSolution && this.currentSolution.number == number) {
      return this.currentSolution;
    }
    return null;
  }

  async fetchSolutionByNumber(number: number | string): Promise<Submission | null> {
    try {
      const solution = await fetchData<Submission>(`/submissions/number/${number}`);
      this.setCurrentSolution(solution);
      return solution;
    } catch (error) {
      console.error("Ошибка загрузки решения:", error);
      return null;
    }
  }

  async deleteSolutionById(solutionId: number): Promise<boolean> {
    try {
      await deleteData(`/submissions/${solutionId}`);
      this.setCurrentSolution(null);
      return true;
    } catch (error) {
      console.error("Ошибка при удалении решения:", error);
      throw error;
    }
  }

  async selectWinner(
    contestId: number,
    submissionId: number,
    executorId: number,
    stageId: number | null = null
  ): Promise<unknown> {
    let url = `/contests/${contestId}/winner?submission_id=${submissionId}&executor_id=${executorId}`;
    if (stageId != null) url += `&stage_id=${stageId}`;
    return sendData(url, {});
  }

  async fetchEvaluation(submissionId: number): Promise<boolean> {
    runInAction(() => { this.evaluationLoading = true; this.evaluationUnavailable = false; });
    try {
      const res = await fetchDataRaw<EvaluationResult>(`/evaluation/${submissionId}`);
      if (res.status === 404) {
        runInAction(() => { this.evaluation = null; });
        return false;
      }
      runInAction(() => { this.evaluation = res.data; });
      return true;
    } catch {
      runInAction(() => { this.evaluation = null; });
      return false;
    } finally {
      runInAction(() => { this.evaluationLoading = false; });
    }
  }

  markEvaluationUnavailable(): void {
    runInAction(() => { this.evaluationUnavailable = true; });
  }

  async triggerEvaluation(submissionId: number): Promise<void> {
    await sendData(`/submissions/${submissionId}/evaluate`, {});
    runInAction(() => {
      this.evaluation = null;
      this.evaluationLoading = true;
      this.evaluationUnavailable = false;
    });
  }
}
