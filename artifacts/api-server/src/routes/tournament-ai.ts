import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import OpenAI from "openai";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 18 * 1024 * 1024,
    files: 1,
  },
});

const MATCH_CALENDAR_MANAGE_ROLES = new Set([
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
]);

type AiTournamentMatch = {
  tournamentName: string | null;
  category: string | null;
  date: string | null;
  venue: string | null;
  field: string | null;
  time: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  notes: string | null;
  confidence: number;
};

type AiTournamentParseResponse = {
  tournamentName: string | null;
  category: string | null;
  matches: AiTournamentMatch[];
  warnings: string[];
};

function getUserRole(req: Request): string {
  return String((req.session as { role?: string } | undefined)?.role ?? "");
}

function textValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function confidenceValue(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function normalizeMatches(value: unknown): AiTournamentMatch[] {
  if (!Array.isArray(value)) return [];
  return value.map((item): AiTournamentMatch => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      tournamentName: textValue(row.tournamentName ?? row.nomeTorneo),
      category: textValue(row.category ?? row.categoria),
      date: textValue(row.date ?? row.data),
      venue: textValue(row.venue ?? row.luogo),
      field: textValue(row.field ?? row.campo),
      time: textValue(row.time ?? row.orario),
      homeTeam: textValue(row.homeTeam ?? row.squadraCasa),
      awayTeam: textValue(row.awayTeam ?? row.squadraTrasferta),
      notes: textValue(row.notes ?? row.note),
      confidence: confidenceValue(row.confidence ?? row.confidenza),
    };
  }).filter((row) => row.homeTeam || row.awayTeam || row.date || row.time);
}

function normalizeAiPayload(value: unknown): AiTournamentParseResponse {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const matches = normalizeMatches(payload.matches ?? payload.partite);
  const tournamentName = textValue(payload.tournamentName ?? payload.nomeTorneo);
  const category = textValue(payload.category ?? payload.categoria);
  return {
    tournamentName,
    category,
    matches: matches.map((match) => ({
      ...match,
      tournamentName: match.tournamentName ?? tournamentName,
      category: match.category ?? category,
    })),
    warnings: Array.isArray(payload.warnings)
      ? payload.warnings.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
  };
}

function buildFilePart(file: Express.Multer.File) {
  const base64 = file.buffer.toString("base64");
  const mime = file.mimetype || "application/octet-stream";
  const fileData = `data:${mime};base64,${base64}`;
  if (mime.startsWith("image/")) {
    return { type: "input_image", image_url: fileData };
  }
  return {
    type: "input_file",
    filename: file.originalname || "torneo",
    file_data: fileData,
  };
}

router.post(
  "/tournament-ai/parse",
  requireAuth,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!MATCH_CALENDAR_MANAGE_ROLES.has(getUserRole(req))) {
      res.status(403).json({ error: "Permesso negato" });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ error: "Importazione AI non configurata: imposta OPENAI_API_KEY sul backend." });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Carica un file torneo da analizzare." });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const context = {
      teamName: textValue(req.body.teamName),
      clubName: textValue(req.body.clubName),
      category: textValue(req.body.category),
      fileName: file.originalname,
      mimeType: file.mimetype,
    };

    try {
      const response = await client.responses.create({
        model: process.env.OPENAI_TOURNAMENT_IMPORT_MODEL ?? "gpt-4.1-mini",
        temperature: 0,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Sei un estrattore dati per calendari di tornei di calcio giovanile. " +
                  "Leggi immagini, PDF, documenti Word o Excel e restituisci solo JSON valido. " +
                  "Non inventare partite o squadre: usa null per campi mancanti e aggiungi warning se incerto.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Estrai tutte le partite visibili dal file torneo. " +
                  "Non filtrare solo la squadra del club: se non la riconosci, restituisci comunque tutte le partite. " +
                  "Schema JSON obbligatorio: {\"tournamentName\": string|null, \"category\": string|null, \"matches\": [{\"tournamentName\": string|null, \"category\": string|null, \"date\": string|null, \"venue\": string|null, \"field\": string|null, \"time\": string|null, \"homeTeam\": string|null, \"awayTeam\": string|null, \"notes\": string|null, \"confidence\": number}], \"warnings\": string[]}. " +
                  "date deve essere YYYY-MM-DD quando possibile; time deve essere HH:mm quando possibile; confidence da 0 a 1. " +
                  `Contesto app: ${JSON.stringify(context)}.`,
              },
              buildFilePart(file) as never,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tournament_ai_parse",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["tournamentName", "category", "matches", "warnings"],
              properties: {
                tournamentName: { type: ["string", "null"] },
                category: { type: ["string", "null"] },
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "tournamentName",
                      "category",
                      "date",
                      "venue",
                      "field",
                      "time",
                      "homeTeam",
                      "awayTeam",
                      "notes",
                      "confidence",
                    ],
                    properties: {
                      tournamentName: { type: ["string", "null"] },
                      category: { type: ["string", "null"] },
                      date: { type: ["string", "null"] },
                      venue: { type: ["string", "null"] },
                      field: { type: ["string", "null"] },
                      time: { type: ["string", "null"] },
                      homeTeam: { type: ["string", "null"] },
                      awayTeam: { type: ["string", "null"] },
                      notes: { type: ["string", "null"] },
                      confidence: { type: "number" },
                    },
                  },
                },
                warnings: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(response.output_text);
      res.json(normalizeAiPayload(parsed));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante l'analisi AI del torneo";
      res.status(502).json({ error: message });
    }
  },
);

export default router;
