const crypto = require("crypto");
const { put } = require("./store");
const { requireAdmin } = require("../../lib/admin-guard");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { isAllowedTikTokUrl } = require("../../lib/security");
const { checkRateLimit } = require("../../lib/rate-limit");

module.exports = async (req, res) => {
  if (
    !requireMethod(req, res, ["POST"])
    || !requireAdmin(req, res)
    || !requireMutationHeader(req, res)
  ) return;

  try {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const limit = await checkRateLimit("shim-create", ip, 200, 60 * 60);
    if (!limit.allowed) return json(res, 429, { success: false, error: "Đã vượt giới hạn tạo link trong một giờ" });
    const body = await readJson(req);
    const rawUrl = body && body.url ? String(body.url).trim() : "";
    const postSlug = String(body?.postSlug || "").trim();

    if (!isAllowedTikTokUrl(rawUrl)) return json(res, 400, { success: false, error: "Chỉ chấp nhận link HTTPS của TikTok" });
    if (!postSlug) return json(res, 400, { success: false, error: "Hãy chọn bài viết cho link này" });

    const id = crypto.randomBytes(6).toString("hex");
    await put(id, { tiktokUrl: new URL(rawUrl).toString(), postSlug, createdAt: new Date().toISOString() });

    return json(res, 200, { success: true, id });
  } catch (_error) {
    return json(res, 400, { success: false, error: "Yêu cầu tạo link không hợp lệ" });
  }
};
