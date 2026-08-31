import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const AUTH_COOKIE = "ppe_auth";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function configuredSecret() {
  return process.env.SESSION_SECRET || "";
}

function sign(payload: string) {
  return createHmac("sha256", configuredSecret()).update(payload).digest("base64url");
}

function matchesSecret(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function createSessionToken() {
  const payload = `${Date.now()}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

function isValidSessionToken(token: unknown) {
  if (typeof token !== "string" || !configuredSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [issuedAt, nonce, signature] = parts;
  if (!issuedAt || !nonce || !signature) return false;
  const timestamp = Number(issuedAt);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > SESSION_TTL_MS || timestamp > Date.now() + 60_000) {
    return false;
  }
  return matchesSecret(signature, sign(`${issuedAt}.${nonce}`));
}

function setNoStore(res: Parameters<Parameters<IRouter["get"]>[1]>[1]) {
  res.setHeader("Cache-Control", "no-store");
}

router.get("/auth/session", (req, res): void => {
  setNoStore(res);
  res.json({ authenticated: isValidSessionToken(req.cookies?.[AUTH_COOKIE]) });
});

router.post("/auth/login", (req, res): void => {
  setNoStore(res);
  const configuredPassword = process.env.PPE_APP_PASSWORD || "";
  if (!configuredPassword || !configuredSecret()) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!matchesSecret(password, configuredPassword)) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  res.cookie(AUTH_COOKIE, createSessionToken(), cookieOptions());
  res.json({ authenticated: true });
});

router.post("/auth/logout", (_req, res): void => {
  setNoStore(res);
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  res.json({ authenticated: false });
});

export default router;