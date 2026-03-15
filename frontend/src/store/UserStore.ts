import { makeAutoObservable } from "mobx";
import { fetchData } from "../services/apiService";
import type { User } from "../types";

export default class UserStore {
  private _isAuth: boolean = false;
  private _user: User | Record<string, never> = {};
  private _users: Record<number, User> = {};

  constructor() {
    this.loadFromLocalStorage();
    makeAutoObservable(this);
  }

  loadFromLocalStorage(): void {
    const storedUser = localStorage.getItem("user");
    const storedIsAuth = localStorage.getItem("isAuth");
    if (storedUser) this._user = JSON.parse(storedUser) as User;
    if (storedIsAuth) this._isAuth = JSON.parse(storedIsAuth) as boolean;
  }

  setIsAuth(bool: boolean): void {
    this._isAuth = bool;
    localStorage.setItem("isAuth", JSON.stringify(bool));
  }

  setUser(user: User | Record<string, never>): void {
    this._user = user;
    localStorage.setItem("user", JSON.stringify(user));
  }

  setUsers(users: Record<number, User>): void {
    this._users = users;
  }

  setUserById(user: User | null | undefined): void {
    if (user && user.id) {
      this._users[user.id] = user;
      console.log(`Пользователь сохранен: ${user.id}, ${user.login}`);
    } else {
      console.error("Ошибка: пользователь или его ID отсутствует", user);
    }
  }

  get isAuth(): boolean {
    return this._isAuth;
  }

  get user(): User | Record<string, never> {
    return this._user;
  }

  getCurrentUserId(): number | null {
    return (this._user as User).id ?? null;
  }

  get users(): Record<number, User> {
    return this._users;
  }

  getById(id: number): User | null {
    return this._users[id] ?? null;
  }

  async fetchUserById(id: number): Promise<User | null> {
    try {
      console.log(`Загрузка пользователя с ID: ${id}`);
      const user = await fetchData<User>(`/users/${id}`);
      console.log("Получен пользователь:", user);
      this.setUserById(user);
      return user;
    } catch (error) {
      console.error(`Ошибка загрузки пользователя с ID ${id}:`, error);
      return null;
    }
  }

  async fetchUsers(): Promise<void> {
    try {
      console.log("Загрузка списка пользователей");
      const users = await fetchData<User[]>("/users");
      const usersMap = users.reduce<Record<number, User>>((acc, user) => {
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
