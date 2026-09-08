const { getSettings } = require("../../lib/content-store");
const { json, readJson, requireMethod } = require("../../lib/http");
const { inspectDeviceSignals } = require("../../lib/device-signals");
const { resolveBanner2Target } = require("../../lib/promo");
const { verifyPromoToken } = require("../../lib/promo-token");
const { checkRateLimit } = require("../../lib/rate-limit");
const { isMobileUserAgent } = require("../../lib/user-agent");

// Mọi lý do từ chối đều trả về cùng một lỗi để người dò không biết mình vướng ở đâu.
function deny(res) {
  return json(res, 404, { success: false, error: "Quảng cáo không khả dụng" });
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    // Nhà mạng di động dồn nhiều thuê bao vào một IP, nên nới bằng mức của promo-click.
    const limit = await checkRateLimit("promo-target", ip, 120, 60);
    if (!limit.allowed) return json(res, 429, { success: false, error: "Bạn thao tác quá nhanh" });
    if (!isMobileUserAgent(req.headers?.["user-agent"])) return deny(res);
    const body = await readJson(req).catch(() => ({}));
    const claims = verifyPromoToken(body.token);
    if (!claims || claims.banner !== "banner2") return deny(res);
    if (!inspectDeviceSignals(body.signals).trusted) return deny(res);
    const settings = await getSettings();
    if (!settings.promoEnabled || !settings.shopeeEnabled) return deny(res);
    // Đọc thẳng từ cấu hình mỗi lượt bấm, nên đổi link affiliate trong admin là ăn ngay.
    const targetUrl = resolveBanner2Target(settings);
    if (!targetUrl) return deny(res);
    return json(res, 200, { success: true, data: { targetUrl } });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải quảng cáo" });
  }
};
