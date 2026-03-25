describe("Авторизация и регистрация", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/");
  });

  it("отображает форму входа", () => {
    cy.contains("button", "Войти").click();
    cy.contains("Добро пожаловать!");
    cy.get('input[placeholder="Логин"]').should("be.visible");
    cy.get('input[placeholder="Пароль"]').should("be.visible");
    cy.contains("button", "Войти").should("be.visible");
  });

  it("отображает форму регистрации с выбором роли", () => {
    cy.contains("button", "Войти").click();
    cy.contains("Зарегистрируйтесь!").click();
    cy.contains("Создать аккаунт");
    cy.get('input[placeholder="Email"]').should("be.visible");
    cy.get('input[placeholder="Логин"]').should("be.visible");
    cy.get('input[placeholder="Пароль"]').should("be.visible");
    cy.get("select").should("be.visible");
    cy.get("select").find("option").should("have.length", 2);
    cy.contains("option", "Фрилансер");
    cy.contains("option", "Организатор");
  });

  it("показывает ошибку при неверном логине", () => {
    cy.contains("button", "Войти").click();
    cy.get('input[placeholder="Логин"]').type("nonexistent_user_xyz");
    cy.get('input[placeholder="Пароль"]').type("wrongpassword");
    cy.get("form").contains("button", "Войти").click();
    cy.contains(/Invalid credentials|Что-то пошло не так/).should("be.visible");
  });

  it("успешный вход как заказчик", () => {
    cy.contains("button", "Войти").click();
    cy.get('input[placeholder="Логин"]').type("customer1");
    cy.get('input[placeholder="Пароль"]').type("test1234");
    cy.get("form").contains("button", "Войти").click();
    cy.url().should("eq", Cypress.config().baseUrl + "/");
    cy.contains("Конкурсы").should("be.visible");
  });

  it("успешный вход как исполнитель", () => {
    cy.contains("button", "Войти").click();
    cy.get('input[placeholder="Логин"]').type("executor1");
    cy.get('input[placeholder="Пароль"]').type("test1234");
    cy.get("form").contains("button", "Войти").click();
    cy.url().should("eq", Cypress.config().baseUrl + "/");
    cy.contains("Мои решения").should("be.visible");
  });

  it("успешный вход как администратор", () => {
    cy.contains("button", "Войти").click();
    cy.get('input[placeholder="Логин"]').type("admin");
    cy.get('input[placeholder="Пароль"]').type("admin123");
    cy.get("form").contains("button", "Войти").click();
    cy.url().should("eq", Cypress.config().baseUrl + "/");
    cy.contains("Админ панель").should("be.visible");
  });

  it("переключение между формами входа и регистрации", () => {
    cy.contains("button", "Войти").click();
    cy.contains("Зарегистрируйтесь!").click();
    cy.url().should("include", "/registration");
    cy.contains("Создать аккаунт");
    cy.contains("Войдите!").click();
    cy.url().should("include", "/login");
    cy.contains("Добро пожаловать!");
  });

  it("выход из аккаунта", () => {
    cy.loginAsCustomer();
    cy.contains("Выйти").click();
    cy.contains("Войти").should("be.visible");
    cy.should(() => {
      expect(localStorage.getItem("isAuth")).to.eq("false");
      expect(localStorage.getItem("user")).to.eq("{}");
      expect(localStorage.getItem("token")).to.be.null;
    });
  });
});
