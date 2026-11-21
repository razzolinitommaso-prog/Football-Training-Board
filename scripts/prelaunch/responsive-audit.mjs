// Runs with the documented CUA tab + viewport APIs. No alternate browser driver.
export const auditWidths = [320, 360, 390, 430, 768, 820, 1024, 1280, 1440];
export const auditCases = [
  { path: "/seasons", role: "admin", name: "Stagioni e backup" },
  { path: "/tactical-board", role: "coach", name: "Lavagna tattica" },
  { path: "/secretary/equipment", role: "secretary", name: "Dotazioni" },
  { path: "/club", role: "admin", name: "Impostazioni società" },
  { path: "/profilo", role: "coach", name: "Profilo" },
  { path: "/fitness-dashboard", role: "fitness_coach", name: "Cruscotto atletico" },
  { path: "/dashboard", role: "technical_director", name: "Cruscotto DT" },
  { path: "/teams", role: "coach", name: "Squadre" },
  { path: "/secretary/payments", role: "secretary", name: "Pagamenti" },
  { path: "/members", role: "director", name: "Membri" },
  { path: "/players", role: "secretary", name: "Giocatori" },
  { path: "/training", role: "coach", name: "Sedute" },
  { path: "/attendance", role: "technical_director", name: "Presenze" },
  { path: "/exercises", role: "coach", name: "Stazioni" },
  { path: "/player-performance", role: "fitness_coach", name: "Test motori" },
  { path: "/season-transition", role: "secretary", name: "Transizione" },
  { path: "/secretary/warehouse", role: "secretary", name: "Magazzino" },
  { path: "/secretary/fee-list", role: "secretary", name: "Listino" },
  { path: "/secretary/documents", role: "secretary", name: "Documenti" },
  { path: "/secretary/extra-time", role: "secretary", name: "Extra Time" },
  { path: "/dirigenti", role: "team_manager", name: "Dirigenti" },
  { path: "/parent/player-card", role: "parent", name: "Scheda genitore" },
  { path: "/parent/payments", role: "parent", name: "Pagamenti genitore" },
  {
    path: "/secretary/payments",
    role: "presidente",
    name: "Pagamenti Presidente",
  },
  {
    path: "/secretary/payments",
    role: "admin",
    name: "Pagamenti Amministratore",
  },
  { path: "/members", role: "sporting_director", name: "Membri DS" },
  {
    path: "/fitness-programs",
    role: "fitness_coach",
    name: "Programmi atletici",
  },
  { path: "/secretary/registrations", role: "secretary", name: "Iscrizioni" },
  { path: "/secretary/shuttle", role: "secretary", name: "Pulmino" },
  { path: "/parent/callups", role: "parent", name: "Convocazioni genitore" },
  { path: "/parent/documents", role: "parent", name: "Documenti genitore" },
  { path: "/parent/notifications", role: "parent", name: "Notifiche genitore" },
  { path: "/parent/kit", role: "parent", name: "Kit genitore" },
];
export async function inspectLayout(tab) {
  return tab.playwright.evaluate(() => {
    const vw = window.innerWidth,
      visible = (el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.right > 0 &&
          r.left < vw &&
          getComputedStyle(el).visibility !== "hidden"
        );
      };
    const narrow = [
      ...document.querySelectorAll(
        "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=color]),textarea,button[role=combobox]",
      ),
    ]
      .filter(visible)
      .filter(
        (el) =>
          el.getBoundingClientRect().width <
          (el.getAttribute("type") === "number" ? 72 : 80),
      )
      .map((el) => ({
        label:
          el.getAttribute("aria-label") ||
          el.closest("label")?.textContent?.trim().slice(0, 75) ||
          el.getAttribute("placeholder") ||
          el.tagName,
        width: Math.round(el.getBoundingClientRect().width),
      }));
    const overflow = [
      ...document.querySelectorAll("main,[role=dialog],.app-page"),
    ]
      .filter(visible)
      .filter((el) => el.scrollWidth > el.clientWidth + 2)
      .map((el) => ({
        element: el.getAttribute("role") || el.tagName,
        width: el.clientWidth,
        scroll: el.scrollWidth,
      }));
    const text = document.body.innerText;
    return {
      viewport: vw,
      documentWidth: document.documentElement.scrollWidth,
      overflow,
      narrow,
      headings: [...document.querySelectorAll("h1,h2")].map(
        (el) => el.textContent,
      ),
      renderError:
        /qualcosa è andato storto|errore imprevisto|non ha completato il caricamento/i.test(
          text,
        ),
      bodyLength: text.length,
    };
  });
}
export async function runResponsiveSweep({
  tab,
  viewport,
  cases = auditCases,
  widths = auditWidths,
  onResult,
  origin = "http://127.0.0.1:5203",
}) {
  const results = [];
  for (const item of cases) {
    await tab.goto(origin + item.path + "?role=" + item.role);
    await tab.playwright.domSnapshot();
    for (const width of widths) {
      await viewport.set({ width, height: 900 });
      await tab.playwright.domSnapshot();
      const result = {
        ...item,
        width,
        actualUrl: await tab.url(),
        ...(await inspectLayout(tab)),
      };
      result.passed =
        new URL(result.actualUrl).pathname === item.path &&
        result.documentWidth <= width + 2 &&
        !result.overflow.length &&
        !result.narrow.length &&
        !result.renderError &&
        result.bodyLength > 80;
      results.push(result);
      if (onResult) await onResult(result);
    }
  }
  return results;
}
