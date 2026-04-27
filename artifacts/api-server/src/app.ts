import "@workspace/db";
import dotenv from "dotenv";
dotenv.config();

import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import connectPgSimple from "connect-pg-simple";
import routes from "./routes";
import { boardsRouter } from "./routes/boards-routers";
const PgSession = connectPgSimple(session);

const app: Express = express();
const isProduction = process.env.NODE_ENV === "production";

function parseAllowedOrigins(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSameSite(value: string | undefined): "lax" | "strict" | "none" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "strict" || normalized === "none") {
    return normalized;
  }
  return "lax";
}

const configuredOrigins = new Set(
  [
    process.env.APP_ORIGIN,
    ...parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
  ].filter(Boolean) as string[],
);

const sameSite = parseSameSite(
  process.env.SESSION_COOKIE_SAMESITE ?? (isProduction ? "none" : "lax"),
);
const secureCookie =
  String(process.env.SESSION_COOKIE_SECURE ?? "").trim().toLowerCase() === "true" ||
  (isProduction && sameSite === "none");

app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isLocalDevOrigin =
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

      if (isLocalDevOrigin || configuredOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      pruneSessionInterval: 60 * 60,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? "secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: secureCookie,
      httpOnly: true,
      sameSite,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api", routes);
app.use("/api/boards", boardsRouter);

export default app;
