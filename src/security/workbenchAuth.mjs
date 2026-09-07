import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export const WORKBENCH_SESSION_COOKIE = "mwb_session";
export const WORKBENCH_SESSION_TTL_SECONDS = 12 * 60 * 60;

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeLoginName(value) {
  return clean(value).toLowerCase();
}

export function validateNewPassword(value) {
  const password = String(value ?? "");
  const blockers = [
    ...(password.length >= 8 ? [] : ["password_too_short"]),
    ...(password.length <= 128 ? [] : ["password_too_long"]),
    ...(password === "12345678" ? ["default_password_cannot_be_reused"] : [])
  ];
  return { valid: blockers.length === 0, blockers };
}

export async function hashPassword(password, { salt = randomBytes(16).toString("base64url") } = {}) {
  const validation = String(password ?? "").length >= 8 && String(password ?? "").length <= 128;
  if (!validation) throw new Error("invalid_password_length");
  const key = await scrypt(String(password), salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY
  });
  return `scrypt$v1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${Buffer.from(key).toString("base64url")}`;
}

export async function verifyPassword(password, encodedHash) {
  const parts = clean(encodedHash).split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v1") return false;
  const N = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  const salt = parts[5];
  const expected = Buffer.from(parts[6], "base64url");
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P || !salt || expected.length !== SCRYPT_KEY_LENGTH) return false;
  try {
    const actual = Buffer.from(await scrypt(String(password ?? ""), salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAX_MEMORY
    }));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionCredential() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}`,
    sessionId: `SESSION-${randomBytes(16).toString("hex").toUpperCase()}`
  };
}

export function hashSessionToken(token) {
  return `sha256:${createHash("sha256").update(String(token ?? "")).digest("hex")}`;
}

export function parseCookieHeader(header = "") {
  return Object.fromEntries(String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [part, ""];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

export function sessionCookie(token, { secure = false, maxAge = WORKBENCH_SESSION_TTL_SECONDS } = {}) {
  return [
    `${WORKBENCH_SESSION_COOKIE}=${encodeURIComponent(String(token || ""))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(secure ? ["Secure"] : []),
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`
  ].join("; ");
}

export function clearSessionCookie({ secure = false } = {}) {
  return sessionCookie("", { secure, maxAge: 0 });
}

export function publicUser(user = {}) {
  return {
    userId: user.user_id || user.userId || "",
    loginName: user.login_name || user.loginName || "",
    displayName: user.display_name || user.displayName || "",
    role: user.user_role || user.role || "operator",
    status: user.user_status || user.status || "",
    mustChangePassword: user.must_change_password ?? user.mustChangePassword ?? false
  };
}
