import { test, expect } from "@playwright/test";
import { inspectLayout } from "./responsive-audit.mjs";
for (const width of [390, 1024]) {
  test(`School LND saved source and preview ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/scuola-calcio/matches?role=technical_director&scenario=school-lnd",
    );
    const actions = page.getByRole("region", {
      name: "Collegamento LND Scuola Calcio",
      exact: true,
    });
    await actions
      .getByRole("combobox", { name: "Annata", exact: true })
      .selectOption("11");
    await actions
      .getByRole("combobox", { name: "Fonte salvata", exact: true })
      .selectOption("901");
    await expect(
      actions.getByRole("link", { name: "Apri fonte LND", exact: true }),
    ).toHaveAttribute("href", /gare\.lnd\.it/);
    await actions
      .getByRole("button", { name: "Sincronizza LND", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Sincronizza da Gare LND",
      exact: true,
    });
    await expect(
      dialog.getByRole("textbox", { name: "URL Gare LND", exact: true }),
    ).toHaveValue(/campionato=COLLAUDO/);
    await dialog
      .getByRole("button", { name: "Leggi anteprima", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Sincronizza girone", exact: true }),
    ).toBeEnabled();
    await expect(dialog).toContainText("8");
    const layout = await inspectLayout({ playwright: page });
    expect(layout.renderError).toBe(false);
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 2);
  });
  test(`Own latest result stays above an eight-game round ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/scuola-calcio/campionati?role=technical_director&scenario=school-lnd",
    );
    const own = page.getByRole("region", {
      name: "Ultimo risultato della società",
      exact: true,
    });
    await expect(own).toContainText("Società di collaudo");
    await expect(own).toContainText("3 - 0");
    const results = page
      .locator("details")
      .filter({
        has: page.getByRole("heading", {
          name: "Ultimi Risultati",
          exact: true,
        }),
      });
    await expect(
      results.getByText("Casa collaudo 1", { exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText("Casa collaudo 7", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Classifica provvisoria aggiornata FTB", { exact: true }),
    ).toHaveCount(0);
    const layout = await inspectLayout({ playwright: page });
    expect(layout.renderError).toBe(false);
    expect(layout.documentWidth).toBeLessThanOrEqual(width + 2);
  });
}
