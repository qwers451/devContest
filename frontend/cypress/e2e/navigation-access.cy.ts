describe("Навигация и доступ", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/");
  });

  it("гость видит только публичную навигацию", () => {
    cy.contains("Конкурсы").should("be.visible");
    cy.contains("button", "Войти").should("be.visible");
    cy.contains("Мои конкурсы").should("not.exist");
    cy.contains("Мои решения").should("not.exist");
    cy.contains("Админ панель").should("not.exist");
  });

  it("заказчик видит доступные ему разделы и открывает профиль", () => {
    cy.loginAsCustomer();

    cy.contains("Мои конкурсы").should("be.visible");
    cy.contains("Добавить конкурс").should("be.visible");
    cy.contains("Мои решения").should("not.exist");
    cy.contains("Админ панель").should("not.exist");

    cy.contains("customer1").click();
    cy.url().should("include", "/profile");
    cy.contains("Мой профиль").should("be.visible");
  });

  it("исполнитель не может открыть страницу создания конкурса", () => {
    cy.loginAsExecutor();

    cy.contains("Конкурсы").should("be.visible");
    cy.contains("Добавить конкурс").should("not.exist");
    cy.contains("Мои решения").should("be.visible");
  });

  it("администратор открывает админ-панель из навигации", () => {
    cy.loginAsAdmin();

    cy.contains("Админ панель").click();
    cy.url().should("include", "/admin");
    cy.contains(/Админ|Статистик|Импорт|Экспорт/i).should("be.visible");
  });
});
