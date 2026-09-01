export type CallupPdfMatch = {
  clubName: string;
  teamName?: string | null;
  opponent?: string | null;
  homeAway?: string | null;
  date?: string | null;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
  preMatchNotes?: string | null;
  convocationAt?: string | null;
  convocationPlace?: string | null;
};

export type CallupPdfPlayer = {
  firstName?: string | null;
  lastName?: string | null;
  playerName?: string | null;
  jerseyNumber?: number | null;
  position?: string | null;
};

function pdfEscape(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\s+/g, " ")
    .trim();
}

function fileSafe(value: string): string {
  return pdfEscape(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "convocazione";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function playerLabel(player: CallupPdfPlayer): string {
  const name = player.playerName?.trim() || `${player.lastName ?? ""} ${player.firstName ?? ""}`.trim();
  const number = player.jerseyNumber ? `${player.jerseyNumber}. ` : "";
  const role = player.position ? ` - ${player.position}` : "";
  return `${number}${name || "Giocatore"}${role}`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = pdfEscape(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function buildContentStream(lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }>): string {
  let y = 790;
  const out = ["BT"];
  for (const line of lines) {
    y -= line.gap ?? 18;
    out.push(`/${line.bold ? "F2" : "F1"} ${line.size ?? 11} Tf`);
    out.push(`50 ${y} Td (${pdfEscape(line.text)}) Tj`);
    out.push(`-50 ${-y} Td`);
  }
  out.push("ET");
  return out.join("\n");
}

function paginateLines(lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }>) {
  const pages: typeof lines[] = [];
  let page: typeof lines = [];
  let y = 790;
  for (const line of lines) {
    const nextY = y - (line.gap ?? 18);
    if (page.length > 0 && nextY < 48) {
      pages.push(page);
      page = [];
      y = 790;
    }
    page.push(line);
    y -= line.gap ?? 18;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

export function buildCallupPdfBlob(input: {
  match: CallupPdfMatch;
  players: CallupPdfPlayer[];
}): Blob {
  const { match } = input;
  const players = [...input.players].sort((a, b) => playerLabel(a).localeCompare(playerLabel(b), "it"));
  const homeLabel = match.homeAway === "away" ? match.opponent || "Avversario" : match.clubName;
  const awayLabel = match.homeAway === "away" ? match.clubName : match.opponent || "Avversario";

  const lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }> = [
    { text: "CONVOCAZIONE", size: 20, bold: true, gap: 8 },
    { text: match.clubName, size: 14, bold: true, gap: 24 },
    { text: `Squadra: ${match.teamName || "-"}`, bold: true, gap: 26 },
    { text: `Partita: ${homeLabel} vs ${awayLabel}` },
    { text: `Competizione: ${match.competition || "-"}` },
    { text: `Data e ora gara: ${formatDateTime(match.date) || "-"}` },
    { text: `Luogo gara: ${match.location || "-"}` },
    { text: `Orario convocazione: ${formatDateTime(match.convocationAt) || "-"}` },
    { text: `Luogo convocazione: ${match.convocationPlace || "-"}` },
  ];

  const notes = [match.preMatchNotes, match.notes].map((v) => v?.trim()).filter(Boolean).join(" - ");
  if (notes) {
    lines.push({ text: "Note", bold: true, gap: 26 });
    wrapText(notes, 82).slice(0, 5).forEach((text) => lines.push({ text }));
  }

  lines.push({ text: `Convocati (${players.length})`, size: 13, bold: true, gap: 28 });
  players.forEach((player, index) => {
    wrapText(`${index + 1}. ${playerLabel(player)}`, 82).forEach((text) => lines.push({ text }));
  });

  lines.push({ text: "Documento generato da Football Training Board", size: 9, gap: 28 });

  const pages = paginateLines(lines);
  const pageObjectNumbers = pages.map((_, index) => 3 + index);
  const font1Object = 3 + pages.length;
  const font2Object = 4 + pages.length;
  const contentStartObject = 5 + pages.length;
  const pageObjects = pages.map((page, index) => {
    const contentObject = contentStartObject + index;
    return `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1Object} 0 R /F2 ${font2Object} 0 R >> >> /Contents ${contentObject} 0 R >>`;
  });
  const contentObjects = pages.map((page) => {
    const content = buildContentStream(page);
    return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ...pageObjects,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ...contentObjects,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export async function downloadOrShareCallupPdf(input: {
  match: CallupPdfMatch;
  players: CallupPdfPlayer[];
}) {
  const blob = buildCallupPdfBlob(input);
  const date = input.match.date ? new Date(input.match.date) : null;
  const datePart = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "data";
  const filename = `${fileSafe(input.match.teamName || "squadra")}-${datePart}-convocazione.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  const shareApi = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (navigator.share && (!shareApi.canShare || shareApi.canShare({ files: [file] }))) {
    await navigator.share({
      title: "Convocazione",
      text: "Convocazione partita",
      files: [file],
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
