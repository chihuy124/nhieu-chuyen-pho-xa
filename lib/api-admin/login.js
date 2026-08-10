const { createSessionToken, isAdminConfigReady, sessionCookie, verifyAdminPassword } = require("../../lib/auth");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { checkRateLimit } = require("../../lib/rate-limit");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["POST"]) || !requireMutationHeader(req, res)) return;
  if (!isAdminConfigReady()) {
    return json(res, 503, { success: false, error: "Admin chưa được cấu hình trên máy chủ" });
  }
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const limit = await checkRateLimit("admin-login", ip, 10, 15 * 60);
    if (!limit.allowed) return json(res, 429, { success: false, error: "Thử đăng nhập quá nhiều lần. Vui lòng chờ 15 phút." });
    const body = await readJson(req);
    if (!verifyAdminPassword(String(body.password || ""), process.env.ADMIN_PASSWORD)) {
      return json(res, 401, { success: false, error: "Mật khẩu không đúng" });
    }
    const token = createSessionToken(process.env.ADMIN_SESSION_SECRET);
    return json(res, 200, { success: true }, { "set-cookie": sessionCookie(token) });
  } catch (_error) {
    return json(res, 400, { success: false, error: "Không thể xử lý yêu cầu đăng nhập" });
  }
};
