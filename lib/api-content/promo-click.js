const { json, readJson, requireMethod } = require("../../lib/http");
const { normalizeBanner, recordPromoClick } = require("../../lib/promo-clicks");
const { checkRateLimit } = require("../../lib/rate-limit");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const limit = await checkRateLimit("promo-click", ip, 120, 60);
    if (!limit.allowed) return json(res, 429, { success: false, error: "Bạn thao tác quá nhanh" });
    const body = await readJson(req).catch(() => ({}));
    if (!normalizeBanner(body.banner)) return json(res, 400, { success: false, error: "Banner không hợp lệ" });
    return json(res, 200, { success: true, data: await recordPromoClick(body.banner) });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không ghi nhận được lượt click" });
  }
};
