describe("Конкурсы", () => {
  describe("Публичный доступ", () => {
    it("отображает список конкурсов на главной", () => {
      cy.visit("/");
      cy.contains("Конкурсы").should("be.visible");
      cy.get(
        "[class*=ContestCard], [class*=contest-card], [class*=rounded-xl]",
      ).should("have.length.greaterThan", 0);
    });

    it("открывает страницу конкурса по клику", () => {
      cy.visit("/");
      cy.get("h3").first().click();
      cy.url().should("match", /\/contest\/\d+/);
      cy.get("h1").should("be.visible");
      cy.contains("Описание проекта").should("be.visible");
    });

    it("отображает статус и призовой фонд конкурса", () => {
      cy.visit("/");
      cy.get("h3").first().click();
      cy.contains("₽").should("be.visible");
      cy.get("[class*=rounded-full]").should("exist");
    });

    it("позволяет использовать и сбрасывать фильтры списка конкурсов", () => {
      cy.visit("/");

      cy.get('input[placeholder="По названию..."]').type("zzz-no-match");
      cy.contains("Нет конкурсов по выбранным фильтрам").should("be.visible");

      cy.contains("label", "Активный").click();
      cy.contains("Нет конкурсов по выбранным фильтрам").should("be.visible");

      cy.contains("button", "Сбросить").click();
      cy.get('input[placeholder="По названию..."]').should("have.value", "");
      cy.get("h3").should("have.length.greaterThan", 0);
    });

    it("показывает детали конкурса и связанные блоки", () => {
      cy.visit("/");
      cy.get("h3").first().click();

      cy.contains("Описание проекта").should("be.visible");
      cy.contains("Создатель:").should("be.visible");
      cy.contains(/призовой фонд|₽/).should("be.visible");
    });
  });

  describe("Заказчик", () => {
    beforeEach(() => {
      cy.loginAsCustomer();
    });

    it("видит ссылку 'Добавить конкурс' в навигации", () => {
      cy.contains("Добавить конкурс").should("be.visible");
    });

    it("видит ссылку 'Мои конкурсы' в навигации", () => {
      cy.contains("Мои конкурсы").should("be.visible");
    });

    it("открывает страницу создания конкурса", () => {
      cy.contains("Добавить конкурс").click();
      cy.contains("Добавить конкурс").should("be.visible");
      cy.get('input[placeholder="Название конкурса"]').should("be.visible");
    });

    it("создаёт новый конкурс", () => {
      cy.contains("Добавить конкурс").click();
      const title = `Тест-конкурс ${Date.now()}`;
      cy.contains("button", "Выберите тип").click();
      cy.get("div.absolute.z-10 button").first().click();
      cy.get('input[placeholder="Название конкурса"]').type(title);
      cy.get('input[placeholder="Краткое описание"]').type(
        "Аннотация тестового конкурса для Cypress с достаточной длиной",
      );
      cy.get('textarea[placeholder*="Полное описание"]').type(
        "Подробное описание тестового конкурса для Cypress. ".repeat(4),
      );
      cy.get('input[type="number"]').first().clear().type("5000");
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 4);
      const dateStr = targetDate.toISOString().split("T")[0];
      cy.get('input[type="date"]').first().type(dateStr);
      cy.contains("button", /Создать|Опубликовать|Сохранить/).click();
      cy.url().should("not.include", "/create-contest", { timeout: 15000 });
    });

    it("видит кнопку 'Решения' на странице своего конкурса", () => {
      cy.contains("Мои конкурсы").click();
      cy.get("h3").first().click();
      cy.url().should("match", /\/contest\/\d+/);
      cy.location("pathname").then((pathname) => {
        const match = pathname.match(/\/contest\/(\d+)/);
        if (!match) {
          throw new Error(
            "Не удалось определить номер конкурса для перехода к решениям",
          );
        }

        cy.get("body").then(($body) => {
          if ($body.text().includes("Решения")) {
            cy.contains("Решения").should("be.visible");
            return;
          }

          cy.visit(`/contest/${match[1]}/solutions`);
          cy.contains("Решения").should("be.visible");
        });
      });
    });

    it("страница 'Мои конкурсы' отображает конкурсы", () => {
      cy.contains("Мои конкурсы").click();
      cy.get("h3").should("have.length.greaterThan", 0);
    });
  });

  describe("Исполнитель", () => {
    beforeEach(() => {
      cy.loginAsExecutor();
    });

    it("не видит 'Добавить конкурс' в навигации", () => {
      cy.visit("/");
      cy.contains("Добавить конкурс").should("not.exist");
    });

    it("видит кнопку 'Отправить решение' на активном конкурсе", () => {
      cy.visit("/");
      cy.get("main")
        .contains("Активный")
        .closest(".group")
        .find("h3")
        .first()
        .click();
      cy.contains("Отправить решение").should("be.visible");
    });
  });
});
