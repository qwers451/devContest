import { makeAutoObservable } from "mobx";
import { fetchData } from "../services/apiService";

export default class UserStore {
    constructor() {
        this._isAuth = false;
        this._user = {};
        this._users = {};
        this.loadFromLocalStorage();
        makeAutoObservable(this);
    }

    loadFromLocalStorage() {
        const storedUser = localStorage.getItem("user");
        const storedIsAuth = localStorage.getItem("isAuth");
        if (storedUser) this._user = JSON.parse(storedUser);
        if (storedIsAuth) this._isAuth = JSON.parse(storedIsAuth);
    }

    setIsAuth(bool) {
        this._isAuth = bool;
        localStorage.setItem("isAuth", JSON.stringify(bool));
    }

    setUser(user) {
        this._user = user;
        localStorage.setItem("user", JSON.stringify(user));
    }

    setUsers(users) {
        this._users = users;
    }

    setUserById(user) {
        if (user && user.id) {
            this._users[user.id] = user;
            console.log(`Пользователь сохранен: ${user.id}, ${user.login}`);
        } else {
            console.error("Ошибка: пользователь или его ID отсутствует", user);
        }
    }

    get isAuth() {
        return this._isAuth;
    }

    get user() {
        return this._user;
    }

    getCurrentUserId() {
        return this._user.id || null;
    }

    get users() {
        return this._users;
    }

    getById(id) {
        return this._users[id] || null;
    }

    async fetchUserById(id) {
        try {
            console.log(`Загрузка пользователя с ID: ${id}`);
            const user = await fetchData(`/users/${id}`);
            console.log("Получен пользователь:", user);
            this.setUserById(user);
            return user;
        } catch (error) {
            console.error(`Ошибка загрузки пользователя с ID ${id}:`, error);
            return null;
        }
    }

    async fetchUsers() {
        try {
            console.log("Загрузка списка пользователей");
            const users = await fetchData("/users");
            const usersMap = users.reduce((acc, user) => {
                acc[user.id] = user;
                return acc;
            }, {});
            this.setUsers(usersMap);
            console.log("Список пользователей сохранен:", usersMap);
        } catch (error) {
            console.error("Ошибка загрузки списка пользователей:", error);
        }
    }
}