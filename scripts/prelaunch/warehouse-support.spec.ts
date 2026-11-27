import { test, expect } from "@playwright/test";
import { inspectLayout } from "./responsive-audit.mjs";
for (const width of [390, 1024]) {
  test(`Secretary availability returns to filtered list ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard?role=secretary&scenario=unavailable-alert");
    await page
      .getByRole("button", { name: "Apri per annata o giocatore", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Cerca giocatore o squadra" })
      .fill("Alessandro");
    await page
      .getByRole("link", { name: "Modifica scheda ↗", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Modifica Giocatore", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: "Giocatori indisponibili",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Cerca giocatore o squadra" }),
    ).toHaveValue("Alessandro");
    const layout = await inspectLayout({ playwright: page });
    expect(layout.renderError).toBe(false);
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 2);
  });
  test(`KIT sizes, supplier costs and responsive form ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/secretary/warehouse?role=secretary");
    await page
      .getByRole("button", {
        name: "Analisi KIT · giacenze, taglie e costi",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "KIT · quadro generale",
      exact: true,
    });
    await expect(dialog).toContainText("Costi da completare");
    await dialog
      .getByRole("button", { name: "Taglie e stagionalità", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", {
        name: "Articolo più venduto ai giocatori",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("row", {
        name: "Tuta rappresentanza M (2) M (2)",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Acquisti e uscite", exact: true })
      .click();
    await expect(dialog).toContainText("Fornitore simulato");
    await expect(dialog).toContainText("Residuo 100,00");
    await dialog
      .getByRole("button", { name: "Registra acquisto fornitore", exact: true })
      .click();
    const form = page.getByRole("dialog", {
      name: "Acquisto KIT dal fornitore",
      exact: true,
    });
    await expect(form.getByRole("checkbox")).not.toBeChecked();
    await expect(
      form.getByRole("button", { name: "Conferma acquisto", exact: true }),
    ).toBeDisabled();
    const layout = await inspectLayout({ playwright: page });
    expect(layout.renderError).toBe(false);
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 2);
  });
  test(`Secretary cannot open technical match workspace ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/scuola-calcio/calendari/11?role=secretary&openMatchId=501",
    );
    await expect(
      page.getByRole("heading", { name: /Supporto gare/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resoconto", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Schieramenti", exact: true }),
    ).toHaveCount(0);
    const layout = await inspectLayout({ playwright: page });
    expect(layout.renderError).toBe(false);
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 2);
  });
}
