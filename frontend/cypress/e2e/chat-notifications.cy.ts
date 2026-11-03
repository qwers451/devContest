// Основной демо-сценарий: переписка заказчика с исполнителем и колокольчик/бейдж.
// Требует запущенный стек с данными seed.py (customer1 <-> executor1 уже общаются).
// Тест дописывает сообщения в живую базу: перед записью демо выполните scripts/reset-demo.sh.
const API = "http://localhost:8080";

type Conv = { id: number; other_user_login: string | null; unread_count: number };

const apiLogin = (login: string, password = "test1234") =>
  cy.request("POST", `${API}/auth/login`, { login, password }).then((res) => res.body.access_token as string);

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Чат и уведомления", () => {
  const text = `Исправил, проверьте SVG ${Date.now()}`;
  const reply = `Спасибо, принимаем! ${Date.now()}`;

  it("исполнитель пишет заказчику: бейдж, toast, ответ и отметка «прочитано»", () => {
    cy.loginAsCustomer();
    cy.contains("a", "Сообщения").should("be.visible");

    // Исполнитель отправляет сообщение через API (как будто из второго окна).
    apiLogin("executor1").then((execToken) => {
      cy.request({ url: `${API}/chat/conversations`, headers: authHeader(execToken) }).then((res) => {
        const conv = (res.body as Conv[]).find((c) => c.other_user_login === "customer1");
        expect(conv, "диалог executor1 <-> customer1 из seed").to.exist;
        cy.wrap(conv!.id).as("convId");
        cy.request({
          method: "POST",
          url: `${API}/chat/conversations/${conv!.id}/messages`,
          headers: authHeader(execToken),
          body: { text },
        });
      });

      // Заказчик видит новое сообщение: toast и бейдж непрочитанных в шапке.
      cy.contains(text, { timeout: 15000 }).should("be.visible");
      cy.contains("a", "Сообщения").find('[aria-label^="Непрочитанных"]').should("be.visible");

      // Открываем диалог и отвечаем через UI.
      cy.contains("a", "Сообщения").click();
      cy.url().should("include", "/messages");
      cy.contains("executor1").click();
      cy.get('textarea[placeholder="Введите сообщение…"]').type(`${reply}{enter}`);
      cy.contains(reply).should("be.visible");

      // Исполнитель получает ответ, а заказчик открыл беседу и прочитал сообщение исполнителя.
      cy.get<number>("@convId").then((convId) => {
        cy.request({
          url: `${API}/chat/conversations/${convId}/messages`,
          headers: authHeader(execToken),
        }).then((res) => {
          const texts = (res.body as { text: string }[]).map((m) => m.text);
          expect(texts).to.include(reply);
          const mine = (res.body as { text: string; read_at: string | null }[]).find((m) => m.text === text);
          expect(mine?.read_at, "сообщение исполнителя прочитано заказчиком").to.not.equal(null);
        });
      });
    });
  });

  it("колокольчик заказчика открывается и показывает центр уведомлений", () => {
    cy.loginAsCustomer();
    cy.get('button[aria-label^="Уведомления"]').first().click();
    cy.contains("Уведомления").should("be.visible");
  });
});
