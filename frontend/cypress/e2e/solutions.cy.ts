describe("Решения", () => {
  it("показывает исполнителю список его решений и открывает карточку решения", () => {
    cy.loginAsExecutor();
    cy.contains("Мои решения").click();

    cy.contains("Мои решения").should("be.visible");
    cy.get("h3", { timeout: 10000 }).should("have.length.greaterThan", 0);
    cy.get("select").select("По названию", { force: true });
    cy.contains("button", "Сбросить").click();

    cy.get("h3").first().click();
    cy.url().should("match", /\/solution\/\d+/);
    cy.contains(/Конкурс «|Описание|Назад/).should("be.visible");
  });

  it("позволяет фильтровать и сбрасывать список моих решений", () => {
    cy.loginAsExecutor();
    cy.contains("Мои решения").click();

    cy.contains("Мои решения").should("be.visible");
    cy.get('input[placeholder="По названию..."]').should("be.enabled").type("zzz-no-match");
    cy.get('input[placeholder="По названию..."]').should(
      "have.value",
      "zzz-no-match",
    );

    cy.contains("label", "Новое").click();
    cy.contains("button", "Сбросить").click();

    cy.get('input[placeholder="По названию..."]').should("have.value", "");
    cy.get("h3").should("have.length.greaterThan", 0);
  });

  it("открывает список решений конкурса для заказчика", () => {
    cy.loginAsCustomer();
    cy.contains("Мои конкурсы").click();

    cy.get("h3").first().click();
    cy.contains("button", "Решения").click();
    cy.url().should("match", /\/contest\/\d+\/solutions/);
    cy.contains(/Решения конкурса|Решения/).should("be.visible");
    cy.contains("← К конкурсу").should("be.visible");
  });

  it("показывает валидацию и предпросмотр при создании решения", () => {
    cy.loginAsExecutor();
    cy.get("h3").first().click();
    cy.contains("button", "Отправить решение").click();

    cy.url().should("match", /\/contest\/\d+\/create-solution/);
    cy.contains("Создание решения").should("be.visible");

    cy.contains("button", "Отправить").click();
    cy.contains("Название должно быть от").should("be.visible");
    cy.contains("Аннотация должна быть от").should("be.visible");
    cy.contains("Описание должно быть от").should("be.visible");

    cy.get('input[placeholder="Название решения"]').type("Решение Cypress");
    cy.get('input[placeholder="Краткое описание решения"]').type(
      "Короткая аннотация для предпросмотра",
    );
    cy.get('textarea[placeholder*="Подробное описание"]').type(
      "# Заголовок{enter}{enter}Текст для предпросмотра",
    );
    cy.contains("button", "Предпросмотр").click();

    cy.contains("Предпросмотр решения").should("be.visible");
    cy.contains("Решение Cypress").should("be.visible");
    cy.contains("Заголовок").should("be.visible");
    cy.contains("Текст для предпросмотра").should("be.visible");
    cy.contains("button", "Закрыть предпросмотр").click();
    cy.contains("Предпросмотр решения").should("not.exist");
  });
});
