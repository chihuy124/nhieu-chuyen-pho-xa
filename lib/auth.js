const crypto = require("crypto");

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function hash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest();
}

function secureEqual(left, right) {
  return crypto.timingSafeEqual(hash(left), hash(right));
}

function verifyAdminPassword(candidate, configuredPassword) {
  if (!candidate || !configuredPassword) return false;
  return secureEqual(candidate, configuredPassword);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(secret, now = Date.now(), ttlMs = SESSION_TTL_MS) {
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET phải có ít nhất 32 ký tự");
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: now + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2 || !secureEqual(parts[1], sign(parts[0], secret))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.role === "admin" && Number.isFinite(payload.exp) && payload.exp > now;
  } catch (_error) {
    return false;
  }
}

function parseCookies(header = "") {
  return String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      const name = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      try {
        return { ...cookies, [name]: decodeURIComponent(rawValue) };
      } catch (_error) {
        return { ...cookies, [name]: rawValue };
      }
    }, {});
}

function sessionCookie(token, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = clear ? 0 : Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${clear ? "" : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function isAdminRequest(req) {
  const cookies = parseCookies(req.headers?.cookie || "");
  return verifySessionToken(cookies[SESSION_COOKIE], process.env.ADMIN_SESSION_SECRET);
}

function isAdminConfigReady() {
  return Boolean(process.env.ADMIN_PASSWORD?.length >= 12 && process.env.ADMIN_SESSION_SECRET?.length >= 32);
}

module.exports = {
  SESSION_COOKIE,
  createSessionToken,
  isAdminConfigReady,
  isAdminRequest,
  parseCookies,
  sessionCookie,
  verifyAdminPassword,
  verifySessionToken,
};
