/// <reference types="cypress" />

const API_GATEWAY = "http://localhost:8080";

Cypress.Commands.add("login", (login: string, password: string) => {
  cy.request("POST", `${API_GATEWAY}/auth/login`, { login, password }).then(
    (res) => {
      cy.visit("/", {
        onBeforeLoad(win) {
          win.localStorage.setItem("token", res.body.access_token);
          win.localStorage.setItem("isAuth", "true");
          win.localStorage.setItem("user", JSON.stringify(res.body.user));
        },
      });
    },
  );
});

Cypress.Commands.add("loginAsCustomer", () => {
  cy.login("customer1", "test1234");
});

Cypress.Commands.add("loginAsExecutor", () => {
  cy.login("executor1", "test1234");
});

Cypress.Commands.add("loginAsAdmin", () => {
  cy.login("admin", "admin123");
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(login: string, password: string): Chainable<void>;
      loginAsCustomer(): Chainable<void>;
      loginAsExecutor(): Chainable<void>;
      loginAsAdmin(): Chainable<void>;
    }
  }
}
