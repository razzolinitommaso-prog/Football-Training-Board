import { test, expect } from "@playwright/test";
// Shared DOM checks with the CUA runner; CI is the only place using a standalone browser driver.
import { auditCases, auditWidths, inspectLayout } from "./responsive-audit.mjs";
for (const item of auditCases)
  for (const width of auditWidths) {
    test(`${item.name} ${item.role} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(item.path + "?role=" + item.role);
      await expect(page.locator("main")).toBeVisible();
      await expect(
        page.getByText("L'app non ha completato il caricamento", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expect
        .poll(async () => {
          const result = await inspectLayout({ playwright: page });
          return (
            result.documentWidth <= width + 2 &&
            !result.overflow.length &&
            !result.narrow.length &&
            !result.renderError
          );
        })
        .toBe(true);
      expect(new URL(page.url()).pathname).toBe(item.path);
      await test.info().attach("responsive-screen", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      if (process.env.FTB_VISUAL_BASELINES === "1")
        await expect(page).toHaveScreenshot(`${item.name}-${width}.png`, {
          fullPage: true,
          animations: "disabled",
        });
    });
  }
test("Senior failure never produces a complete combined chart", async ({
  page,
}) => {
  await page.goto("/secretary/payments?role=secretary&scenario=senior-error");
  await page
    .getByRole("button", { name: "Registro e grafici", exact: true })
    .click();
  await expect(
    page.getByText("Grafico sospeso:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Riprova uscite Prima Squadra" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Esporta controllo Excel" }),
  ).toHaveCount(0);
});
for (const item of auditCases)
  test(`WCAG A/AA · ${item.name}`, async ({ page }) => {
    await page.goto(item.path + "?role=" + item.role);
    if (item.path === "/secretary/payments")
      await page
        .getByRole("button", { name: "Registro e grafici", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Analizza accessibilità", exact: true })
      .click();
    const result = page.getByTestId("a11y-result");
    await expect(result).toBeVisible();
    const report = JSON.parse(await result.innerText());
    expect(report.error).toBeUndefined();
    expect(
      report.violations.filter((row: { impact: string }) =>
        ["serious", "critical"].includes(row.impact),
      ),
    ).toEqual([]);
  });
test("Reconciliation Excel download", async ({ page }) => {
  await page.goto("/secretary/payments?role=secretary");
  await page
    .getByRole("button", { name: "Registro e grafici", exact: true })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "Controllo quadrature e dati mancanti" })
    .click();
  const download = page.waitForEvent("download", { timeout: 10000 });
  await page
    .getByRole("button", { name: "Esporta controllo Excel", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^controllo-contabile-.*\.xlsx$/,
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Esportazione Excel avviata" }),
  ).toBeVisible();
});
