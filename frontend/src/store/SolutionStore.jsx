import { makeAutoObservable } from "mobx";
import { fetchData, deleteData, updateData } from "../services/apiService";

const baseForm = {
    title: {
        value: '',
        error: '',
        rules: {min: 10, max: 100 },
    },
    annotation: {
        value: '',
        error: '',
        rules: {min: 30, max: 200 },
    },
    description: {
        value: '',
        error: '',
        rules: { min: 100, max: 20000 },
    },
    files: {
        error: '',
        rules: { max: 20 },
        allowedTypes: ['application/zip', 'application/x-zip-compressed', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif'],
    }
};

export default class SolutionStore {
    form = baseForm;

    formErrors = {
        title: `Название должно быть от ${this.form.title.rules.min} до ${this.form.title.rules.max} символов`,
        annotation: `Аннотация должна быть от ${this.form.annotation.rules.min} до ${this.form.annotation.rules.max} символов`,
        description: `Описание должно быть от ${this.form.description.rules.min} до ${this.form.description.rules.max} символов`,
        files: `Максимальное количество файлов - ${this.form.files.rules.max}`
    };

    statusMap = {
        1: { label: 'Новое', color: '#87cefa', textColor: '#000' },       // Голубой
        2: { label: 'Просмотрено', color: '#99ff99', textColor: '#000' },  // Салатовый
        3: { label: 'Победитель', color: '#008000', textColor: '#000' },   // Зеленый
        4: { label: 'Необходимы правки', color: '#f3a505', textColor: '#000' }, // Желтый
        5: { label: 'Правки внесены', color: '#87cefa', textColor: '#000' },    // Синий
    };

    constructor() {
        this._solutions = [];
        this._currentSolution = null;
        this._searchQuery = '';
        this._selectedStatuses = [];
        this._addedBefore = null;
        this._addedAfter = null;
        this._freelancerId = null;
        this._contestId = null;
        this.isLoading = true;
        this._lastFilterParams = null;
        this._searchForMySolutions = null;
        this._page = 1;
        this._limit = 2;
        this._totalCount = 0;
        makeAutoObservable(this);
    }

    setSolutions(solutions) {
        this._solutions = solutions;
    }

    setCurrentSolution(solution) {
        this._currentSolution = solution;
    }

    setSearchQuery(query, searchForMySolutions) {
        this._searchQuery = query;
        this._searchForMySolutions = searchForMySolutions;
    }

    setSelectedStatuses(statuses) {
        this._selectedStatuses = statuses;
    }

    setAddedBefore(date) {
        if (!date) {
            this._addedBefore = null;
            return;
        }
        this._addedBefore = new Date(date);
    }

    setAddedAfter(date) {
        if (!date) {
            this._addedAfter = null;
            return;
        }
        this._addedAfter = new Date(date);
    }

    setFreelancerId(id) {
        this._freelancerId = id;
    }

    setContestId(id) {
        this._contestId = id;
    }

    setLoading(bool) {
        this.isLoading = bool;
    }

    setPage(page) {
        this._page = page;
    }

    setLimit(limit) {
        this._limit = limit;
    }

    get solutions() {
        return this._solutions;
    }

    get currentSolution() {
        return this._currentSolution;
    }

    get searchQuery() {
        return this._searchQuery;
    }

    get selectedStatuses() {
        return this._selectedStatuses;
    }

    get addedBefore() {
        return this._addedBefore;
    }

    get addedAfter() {
        return this._addedAfter;
    }

    get freelancerId() {
        return this._freelancerId;
    }

    get contestId() {
        return this._contestId;
    }

    get page() {
        return this._page;
    }

    get limit() {
        return this._limit;
    }

    get totalCount() {
        return this._totalCount;
    }

    get statusOptions() {
        return Object.entries(this.statusMap).map(([value, data]) => ({
            value: parseInt(value),
            label: data.label,
            color: data.color,
            textColor: data.textColor
        }));
    }

    hasFiltersChanged(params) {
        if (!this._lastFilterParams) return true;
        return JSON.stringify(params) !== JSON.stringify(this._lastFilterParams);
    }

    async fetchSolutionsFiltered() {
        try {
            const params = {};
            params.page = this._page;
            params.limit = this._limit;

            if (this._searchQuery) {
                params.search = this._searchQuery;
            }

            if (this._selectedStatuses?.length > 0) {
                params.statuses = this._selectedStatuses.join(',');
            }

            if (this._addedBefore) {
                params.addedBefore = this._addedBefore.toISOString().split('T')[0];
            }

            if (this._addedAfter) {
                params.addedAfter = this._addedAfter.toISOString().split('T')[0];
            }

            if (this._freelancerId) {
                params.freelancerId = this._freelancerId;
            }

            if (this._contestId) {
                params.contestId = this._contestId;
            }

            if (this._searchForMySolutions) {
                params.searchForMySolutions = this._searchForMySolutions;
            }

            if (!this.hasFiltersChanged(params) && this._solutions.length > 0) {
                console.log('Using cached solutions');
                this.setLoading(false);
                return;
            }

            this.setLoading(true)

            console.log('Fetching solutions with params:', params);

            const response = await fetchData("/solutions/filter", params);
            this.setSolutions(response.solutions || []);
            this._totalCount = response.total || 0;
            this._lastFilterParams = params;
        } catch (error) {
            console.error("Ошибка при отправке:", error);
        } finally {
            this.setLoading(false);
        }
    }

    resetFilters() {
        this._searchQuery = '';
        this._searchForMySolutions = null;
        this._selectedStatuses = [];
        this._addedBefore = null;
        this._addedAfter = null;
        this.fetchSolutionsFiltered();
    }

    getStatus(number) {
        return this.statusMap[number] || { label: 'Неизвестно', color: 'dark' };
    }

    setFormField(field, value) {
        this.form[field].value = value;
        this.validateField(field);
    }

    resetForm() {
        this.form = baseForm;
    }

    validateField(field) {
        switch (field) {
            case 'title':
                this.form.title.error = !(this.form.title.value.length >= this.form.title.rules.min &&
                    this.form.title.value.length <= this.form.title.rules.max)
                    ? this.formErrors.title : '';
                break;
            case 'annotation':
                this.form.annotation.error = !(this.form.annotation.value.length >= this.form.annotation.rules.min &&
                    this.form.annotation.value.length <= this.form.annotation.rules.max)
                    ? this.formErrors.annotation : '';
                break;
            case 'description':
                this.form.description.error = !(
                    this.form.description.value.length >= this.form.description.rules.min &&
                    this.form.description.value.length <= this.form.description.rules.max
                ) ? this.formErrors.description : '';
                break;
        }
    }

    validateForm() {
        Object.keys(this.form).forEach(field => this.validateField(field));
        return !Object.values(this.form).some(field => field.error !== '');
    }

    _updateLocalSolution(updatedSolution) {
        const index = this._solutions.findIndex(s => s.id === updatedSolution.id);
        if (index !== -1) {
            this._solutions[index] = { ...updatedSolution };
        }
        if (this._currentSolution?.id === updatedSolution.id) {
            this._currentSolution = { ...updatedSolution };
        }
    }

    async updateSolutionStatus(solutionId, newStatus) {
        try {
            const validStatuses = Object.keys(this.statusMap).map(Number);
            const minStatus = Math.min(...validStatuses);
            const maxStatus = Math.max(...validStatuses);
            if (typeof newStatus !== 'number' || !validStatuses.includes(newStatus)) {
                throw new Error(`Статус должен быть числом от ${minStatus} до ${maxStatus}`);
            }
            const response = await updateData(`/solutions/${solutionId}`, {status: newStatus});
            this._updateLocalSolution(response);
            return response;
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
            throw error;
        }
    }

    getSolutionIfExists(number) {
        if (this.currentSolution && this.currentSolution.number == number) {
            return this.currentSolution;
        }
        return null;
    }

    async fetchSolutionByNumber(number) {
        try {
            const solution = await fetchData(`/solutions/number/${number}`);
            this.setCurrentSolution(solution);
            return solution;
        } catch (error) {
            console.error("Ошибка загрузки решения:", error);
            return null;
        }
    }

    async deleteSolutionById(solutionId) {
        try {
            await deleteData(`/solutions/${solutionId}`);
            this.setCurrentSolution(null);
            return true;
        } catch (error) {
            console.error("Ошибка при удалении решения:", error);
            throw error;
        }
    }
}
