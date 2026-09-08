const crypto = require("crypto");

const TOKEN_TTL_MS = 30 * 60 * 1000;

// Người dùng có thể ở lại app TikTok khá lâu rồi mới quay về xem banner 2,
// nên lượt cấp phải sống đủ dài để không bắt họ xin lại giữa chừng.
function promoTokenSecret(env = process.env) {
  const explicit = String(env.PROMO_LINK_SECRET || "");
  if (explicit.length >= 32) return explicit;
  const base = String(env.ADMIN_SESSION_SECRET || "");
  // Tách khoá riêng cho link quảng cáo để nó không dùng chung chữ ký với phiên quản trị.
  return base.length >= 32 ? crypto.createHmac("sha256", base).update("promo-link-v1").digest("base64url") : "";
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function secureEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left || "")).digest();
  const rightHash = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function createPromoToken({ banner, campaignId }, secret = promoTokenSecret(), now = Date.now()) {
  if (!secret) return "";
  const payload = Buffer.from(JSON.stringify({
    b: String(banner || ""),
    c: String(campaignId || ""),
    exp: now + TOKEN_TTL_MS,
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function verifyPromoToken(token, secret = promoTokenSecret(), now = Date.now()) {
  if (!secret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !secureEqual(parts[1], sign(parts[0], secret))) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch (_error) { return null; }
  if (!claims || typeof claims !== "object" || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
  return { banner: String(claims.b || ""), campaignId: String(claims.c || "") };
}

module.exports = { TOKEN_TTL_MS, createPromoToken, promoTokenSecret, verifyPromoToken };
