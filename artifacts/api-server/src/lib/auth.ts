import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

declare module "express-session" {
  interface SessionData {
    userId: number;
    clubId: number;
    role: string;
    isSuperAdmin: boolean;
    section?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId && req.session.userId !== 0) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isSuperAdmin) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.userId && req.session.userId !== 0) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.session.role ?? "")) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

type AuthTokenPayload = {
  userId: number;
  clubId?: number;
  role?: string;
  section?: string | null;
  isSuperAdmin?: boolean;
  exp: number;
};

function authTokenSecret() {
  return process.env.SESSION_SECRET || process.env.AUTH_TOKEN_SECRET || "secret";
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", authTokenSecret()).update(payload).digest("base64url");
}

export function createAuthToken(payload: Omit<AuthTokenPayload, "exp">, maxAgeMs = 7 * 24 * 60 * 60 * 1000): string {
  const body = base64Url(JSON.stringify({ ...payload, exp: Date.now() + maxAgeMs } satisfies AuthTokenPayload));
  return `${body}.${signPayload(body)}`;
}

function verifyAuthToken(token: string): AuthTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = signPayload(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthTokenPayload;
    if (!payload || typeof payload.userId !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function attachBearerSession(req: Request, _res: Response, next: NextFunction): void {
  if (req.session.userId || req.session.userId === 0) {
    next();
    return;
  }
  const auth = req.headers.authorization ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    next();
    return;
  }
  const payload = verifyAuthToken(match[1]);
  if (!payload) {
    next();
    return;
  }
  req.session.userId = payload.userId;
  if (typeof payload.clubId === "number") req.session.clubId = payload.clubId;
  if (payload.role) req.session.role = payload.role;
  if (payload.section) req.session.section = payload.section;
  if (payload.isSuperAdmin) req.session.isSuperAdmin = true;
  next();
}
