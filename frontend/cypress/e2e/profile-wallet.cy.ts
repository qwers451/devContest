describe("Профиль и кошелёк", () => {
  it("загружает профиль заказчика и возвращается назад без сохранения", () => {
    cy.loginAsCustomer();
    cy.visit("/");
    cy.contains("customer1").click();

    cy.contains("Мой профиль").should("be.visible");
    cy.get('input[name="email"]').should("not.have.value", "");
    cy.get('input[name="login"]').should("have.value", "customer1");
    cy.get('input[name="password"]').should("have.value", "");

    cy.contains("button", "Отмена").click();
    cy.url().should("eq", `${Cypress.config().baseUrl}/`);
  });

  it("показывает заказчику вкладки кошелька и клиентскую валидацию пополнения", () => {
    cy.loginAsCustomer();
    cy.get('[title="Кошелёк"]').click();

    cy.contains("Кошелёк").should("be.visible");
    cy.contains("Баланс").should("be.visible");
    cy.contains("Транзакции").should("be.visible");
    cy.contains("Платежи").should("be.visible");
    cy.contains("Выплаты").should("be.visible");

    cy.get('input[placeholder="Сумма пополнения"]').type("0");
    cy.contains("button", "Пополнить").click();
    cy.get('input[placeholder="Сумма пополнения"]').should("have.value", "0");
    cy.contains("Как работает кошелёк:").should("be.visible");
  });

  it("показывает read-only состояния вкладок кошелька заказчика", () => {
    cy.loginAsCustomer();
    cy.get('[title="Кошелёк"]').click();

    cy.contains("button", "Транзакции").click();
    cy.contains(
      /Операций пока нет|Пополнение|Оплата конкурса|Выигрыш|Возврат/,
    ).should("be.visible");

    cy.contains("button", "Платежи").click();
    cy.contains(
      /Платежей пока нет|Вернуть|Оплачено|Завершён|Возвращено/,
    ).should("be.visible");

    cy.contains("button", "Выплаты").click();
    cy.contains(/Выплат пока нет|Вывод с кошелька|Карта \*\*\*\*/).should(
      "be.visible",
    );
  });

  it("показывает исполнителю форму вывода и клиентскую валидацию суммы", () => {
    cy.loginAsExecutor();
    cy.get('[title="Кошелёк"]').click();

    cy.contains("Платежи").should("not.exist");
    cy.contains("button", "Вывести").click();
    cy.contains("Вывести средства").should("be.visible");
    cy.get('input[placeholder="Например: 1000"]').type("0");
    cy.get('input[placeholder="Номер карты (необязательно)"]').type(
      "4111111111111111",
    );
    cy.contains("button", "Вывести средства").click();

    cy.get('input[placeholder="Например: 1000"]').should("have.value", "0");
    cy.get('input[placeholder="Номер карты (необязательно)"]').should(
      "have.value",
      "4111111111111111",
    );

    cy.contains("button", "Выплаты").click();
    cy.contains(/Выплат пока нет|Вывод с кошелька|Карта \*\*\*\*/).should(
      "be.visible",
    );
  });
});
