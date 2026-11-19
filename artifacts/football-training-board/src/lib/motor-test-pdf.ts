import { motorTestCatalog, motorTestCycles, motorTestCompletion, motorCompletionLabels, motorResultLines, motorAssessmentMeasurement, summarizeMotorTests, type MotorTestSession } from "@workspace/api-zod";

type Player = { id: number; name: string; family: string | null; coach: string | null };
const text = (value: unknown) => String(value ?? "").replace(/[–—−]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/·/g, " - ").replace(/\t/g, " ");
// PDF streams stay ASCII; octal escapes preserve Italian accents in WinAnsi fonts.
const escape = (value: string) => text(value).replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, c => c.charCodeAt(0) <= 255 ? "\\" + c.charCodeAt(0).toString(8).padStart(3, "0") : "-");
const widths = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const measuredWidth = (value: string, size: number) => [...value.normalize("NFD").replace(/\p{Diacritic}/gu, "")].reduce((n, c) => n + (widths[c.charCodeAt(0) - 32] ?? 600), 0) * size / 1000 * 1.08;
function wrap(value: string, width: number, size = 10) {
  return text(value).split(/\r?\n/).flatMap(part => {
    const lines: string[] = []; let line = "";
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const pieces: string[] = []; let chunk = "";
      for (const char of word) { if (chunk && measuredWidth(chunk + char, size) > width) { pieces.push(chunk); chunk = ""; } chunk += char; }
      if (chunk) pieces.push(chunk);
      for (const piece of pieces) {
        if (line && measuredWidth(line + " " + piece, size) > width) { lines.push(line); line = ""; }
        line += (line ? " " : "") + piece;
      }
    }
    return [...lines, line];
  });
}

/** A4 report with bounded table rows, repeated context and independent player sheets. */
export function buildMotorTestPdf(session: MotorTestSession, roster: Player[], team: string): Blob {
  const pages: string[][] = []; let page: string[] = [], y = 0, context = "Programma e presenze", activeSection = "";
  const date = session.date.split("-").reverse().join("/");
  const draw = (value: string, x: number, baseline: number, size = 10, bold = false, color = "0.1 0.15 0.2") => {
    page.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${baseline} Tm (${escape(value)}) Tj ET`);
  };
  const box = (x: number, top: number, width: number, height: number, fill: string) => {
    page.push(`q ${fill} rg 0.84 0.88 0.9 RG 0.4 w ${x} ${top - height} ${width} ${height} re B Q`);
  };
  function newPage() {
    page = []; pages.push(page);
    draw("FORTIS JUVENTUS 1909", 40, 802, 10, true, "0 0.4 0.28");
    draw("TEST MOTORI", 40, 779, 19, true);
    const header = wrap(`${team} | ${date} | ${motorTestCycles[session.cycle]}`, 515, 9);
    header.forEach((line, i) => draw(line, 40, 760 - i * 12, 9));
    y = 736 - (header.length - 1) * 12;
    for (const line of wrap(context, 515, 12)) { draw(line, 40, y, 12, true); y -= 17; }
    y -= 8;
  }
  function heading(label: string, continuation = false) {
    const lines = wrap(label + (continuation ? " - continua" : ""), 495, 11), h = lines.length * 14 + 12;
    if (y - h - 45 < 52) newPage();
    box(40, y, 515, h, "0.9 0.96 0.94");
    lines.forEach((line, i) => draw(line, 50, y - 17 - i * 14, 11, true));
    y -= h + 5;
  }
  function section(label: string) { activeSection = label; heading(label); }
  function row(label: string, value: unknown) {
    const left = wrap(label, 193, 9), right = wrap(String(value ?? "-"), 282, 10);
    let offset = 0; const count = Math.max(left.length, right.length);
    while (offset < count) {
      if (y - 28 < 52) { newPage(); heading(activeSection, true); }
      const lines = Math.min(count - offset, Math.max(1, Math.floor((y - 64) / 13)));
      const h = lines * 13 + 12;
      box(40, y, 213, h, "0.96 0.97 0.98"); box(253, y, 302, h, "1 1 1");
      for (let i = 0; i < lines; i++) {
        if (left[offset + i]) draw(left[offset + i], 50, y - 16 - i * 13, 9);
        if (right[offset + i]) draw(right[offset + i], 263, y - 16 - i * 13, 10);
      }
      y -= h; offset += lines;
    }
  }
  newPage();
  section("Riepilogo sessione");
  row("Programma", `${session.tests.length} prove | ${session.tests.reduce((n, t) => n + t.minutes, 0)} minuti complessivi`);
  for (const [i, test] of session.tests.entries()) {
    const info = motorTestCatalog.find(t => t.id === test.id)!;
    y -= 12; section(`${i + 1}. ${info.title}`);
    row("Durata e obiettivo", `${test.minutes} min | ${info.principle}`);
    row("Materiali", info.materials); row("Allestimento ed esecuzione", info.instructions);
  }
  const players = new Map(roster.map(p => [p.id, p]));
  for (const key of Object.keys(session.results)) if (!players.has(Number(key))) players.set(Number(key), { id: Number(key), name: "Giocatore " + key, coach: null, family: null });
  context = "Presenze della sessione"; newPage(); section("Giocatore / appello / disponibilità famiglia");
  const coach: Record<string, string> = { present: "Presente", absent: "Assente", injured: "Infortunato", requested: "Richiesto" };
  const family: Record<string, string> = { available: "Disponibile", unavailable: "Non disponibile", pending: "In attesa" };
  for (const p of players.values()) row(p.name, `${coach[p.coach ?? ""] ?? "Appello da registrare"} | ${family[p.family ?? ""] ?? "Famiglia: in attesa"}`);
  for (const p of players.values()) {
    const result = session.results[p.id];
    if (!result) continue; // Listed in attendance; do not create empty sheets for untested players.
    context = `Scheda giocatore - ${p.name}`; newPage();
    const completion = motorTestCompletion(session.tests, result);
    section("Situazione del test");
    row("Stato", `${motorCompletionLabels[completion.status]} | ${completion.completed}/${completion.total} prove eseguite | ${completion.assessed}/${completion.total} valutazioni complete`);
    row("Statura / peso", `${result.height ?? "-"} cm | ${result.weight ?? "-"} kg`);
    const historicalIndex = summarizeMotorTests([{ id: session.id, date: session.date, cycle: session.cycle, result }]).index;
    if (historicalIndex != null) row("Indice dei voti storici (non TGMD-3)", `${historicalIndex}%`);
    for (const [i, test] of session.tests.entries()) {
      if (test.id === "anthropometry") continue;
      const info = motorTestCatalog.find(t => t.id === test.id)!, value = result.tests[test.id];
      y -= 12; section(`${i + 1}. ${info.title}`);
      const measure = value?.assessment ? motorAssessmentMeasurement(test.id, value.assessment) ?? value.measurement : value?.measurement;
      row("Misura di riepilogo", measure != null ? `${measure} ${info.unit}` : "Da rilevare / completare");
      if ((test.id === "high-jump" || test.id === "long-jump") && result.height && measure != null) row("Misura relativa alla statura", `${Math.round(1000 * measure / result.height) / 10}%`);
      if (value?.score != null) row("Voto storico (non TGMD-3)", `${value.score}/10`);
      for (const line of motorResultLines(test.id, value)) {
        if (line.startsWith("Tentativo ") || line.startsWith("TGMD-3 prova ")) { y -= 8; section(`${info.title} | ${line}`); continue; }
        const split = line.indexOf(":");
        row(split < 0 ? "Dettaglio" : line.slice(0, split), split < 0 ? line : line.slice(split + 1).trim());
      }
      if (value?.notes) { y -= 8; section(`${info.title} | Note aggiuntive`); row("Note aggiuntive sulla prova", value.notes); }
    }
  }
  context = "Riferimenti e lettura dei risultati"; newPage(); section("Interpretazione");
  row("Osservazioni didattiche", "Non sono punteggi TGMD-3. Le valutazioni di coordinazione e percezione spazio-tempo restano osservazioni interne.");
  row("TGMD-3 salto in lungo", "1 = criterio eseguito; 0 = non eseguito; vuoto = da osservare. Due prove formali, familiarizzazione esclusa. Grezzo del singolo item /8 solo con protocollo confermato; non è un percentile o un indice globale. Applicare il manuale italiano completo.");
  row("ALPHA e confronti", "Migliore di due tentativi validi. Confrontare misure solo con protocollo e condizioni invariati. Misure, tentativi e osservazioni restano distinti.");
  pages.forEach((p, i) => { page = p; draw("Football Training Board | Test motori", 40, 28, 8); draw(`Pagina ${i + 1} / ${pages.length}`, 465, 28, 8); });
  const fonts = 3 + pages.length, start = fonts + 2;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ...pages.map((_, i) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fonts} 0 R /F2 ${fonts + 1} 0 R >> >> /Contents ${start + i} 0 R >>`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ...pages.map(p => { const content = p.join("\n"); return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`; })];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
