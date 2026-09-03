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

type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number; x?: number; y?: number };
type PdfPage = PdfLine[];

function buildContentStream(lines: PdfLine[]): string {
  let y = 790;
  const out = ["BT"];
  for (const line of lines) {
    if (line.y == null) y -= line.gap ?? 18;
    const drawY = line.y ?? y;
    const drawX = line.x ?? 50;
    out.push(`/${line.bold ? "F2" : "F1"} ${line.size ?? 11} Tf`);
    out.push(`1 0 0 1 ${drawX} ${drawY} Tm (${pdfEscape(line.text)}) Tj`);
  }
  out.push("ET");
  return out.join("\n");
}

function addFlowLine(state: { pages: PdfPage[]; page: PdfPage; y: number }, line: PdfLine) {
  const gap = line.gap ?? 16;
  const nextY = state.y - gap;
  if (state.page.length > 0 && nextY < 58) {
    state.pages.push(state.page);
    state.page = [];
    state.y = 790;
  }
  state.y -= gap;
  state.page.push({ ...line, x: line.x ?? 50, y: state.y });
}

function buildCallupPages(match: CallupPdfMatch, players: CallupPdfPlayer[]): PdfPage[] {
  const state = { pages: [] as PdfPage[], page: [] as PdfPage, y: 790 };
  const homeLabel = match.homeAway === "away" ? match.opponent || "Avversario" : match.clubName;
  const awayLabel = match.homeAway === "away" ? match.clubName : match.opponent || "Avversario";

  addFlowLine(state, { text: "CONVOCAZIONE", size: 20, bold: true, gap: 0 });
  addFlowLine(state, { text: match.clubName, size: 14, bold: true, gap: 24 });
  addFlowLine(state, { text: `Squadra: ${match.teamName || "-"}`, bold: true, gap: 28 });
  addFlowLine(state, { text: `Partita: ${homeLabel} vs ${awayLabel}` });
  addFlowLine(state, { text: `Competizione: ${match.competition || "-"}` });
  addFlowLine(state, { text: `Data e ora gara: ${formatDateTime(match.date) || "-"}` });
  addFlowLine(state, { text: `Luogo gara: ${match.location || "-"}` });
  addFlowLine(state, { text: `Orario convocazione: ${formatDateTime(match.convocationAt) || "-"}` });
  addFlowLine(state, { text: `Luogo convocazione: ${match.convocationPlace || "-"}` });

  const notes = [match.preMatchNotes, match.notes].map((v) => v?.trim()).filter(Boolean).join(" - ");
  if (notes) {
    addFlowLine(state, { text: "Note", bold: true, gap: 26 });
    wrapText(notes, 86).slice(0, 5).forEach((text) => addFlowLine(state, { text, size: 10, gap: 14 }));
  }

  addFlowLine(state, { text: `Convocati (${players.length})`, size: 13, bold: true, gap: 30 });
  if (players.length === 0) {
    addFlowLine(state, { text: "Nessun convocato", size: 10, gap: 18 });
  } else {
    players.forEach((player, index) => {
      wrapText(`${index + 1}. ${playerLabel(player)}`, 88).forEach((text, lineIndex) => {
        addFlowLine(state, { text, size: 10, gap: lineIndex === 0 ? 18 : 12 });
      });
    });
  }

  state.page.push({ text: "Documento generato da Football Training Board", size: 9, x: 50, y: 34 });
  state.pages.push(state.page);
  return state.pages;
}

function isLikelyMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function buildCallupPdfBlob(input: {
  match: CallupPdfMatch;
  players: CallupPdfPlayer[];
}): Blob {
  const { match } = input;
  const players = [...input.players].sort((a, b) => playerLabel(a).localeCompare(playerLabel(b), "it"));
  const pages = buildCallupPages(match, players);
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
  preferShare?: boolean;
}): Promise<{ filename: string; url?: string }> {
  const blob = buildCallupPdfBlob(input);
  const date = input.match.date ? new Date(input.match.date) : null;
  const datePart = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "data";
  const filename = `${fileSafe(input.match.teamName || "squadra")}-${datePart}-convocazione.pdf`;
  const blobUrl = URL.createObjectURL(blob);

  if ((input.preferShare || isLikelyMobileBrowser()) && typeof File !== "undefined" && navigator.share) {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      const shareApi = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (shareApi.canShare && !shareApi.canShare({ files: [file] })) throw new Error("File sharing not supported");
      await navigator.share({
        title: "Convocazione",
        text: "Convocazione partita",
        files: [file],
      });
      URL.revokeObjectURL(blobUrl);
      return { filename };
    } catch (error) {
      if ((error as DOMException | undefined)?.name === "AbortError") {
        URL.revokeObjectURL(blobUrl);
        return { filename };
      }
    }
  }

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  try {
    window.open(blobUrl, "_blank", "noopener");
  } catch {
    // The visible link returned to the UI remains available if automatic opening is blocked.
  }
  return { filename, url: blobUrl };
}
