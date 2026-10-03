const { getSettings } = require("../../lib/content-store");
const { json, readJson, requireMethod } = require("../../lib/http");
const { inspectDeviceSignals } = require("../../lib/device-signals");
const { banner2Platform, resolveBanner2Target } = require("../../lib/promo");
const { resolveShopeeAppLink } = require("../../lib/shopee-link");
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
    // Nhà mạng di động dồn hàng trăm thuê bao vào một IP công cộng, nên ngưỡng phải
    // rộng để lúc đông khách không ai bị chặn nhầm mất banner. Vẫn giữ một mức trần
    // vì mỗi lượt gọi kéo theo một request sang Shopee để giải link.
    const limit = await checkRateLimit("promo-target", ip, 600, 60);
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
    if (banner2Platform(settings) !== "shopee") return json(res, 200, { success: true, data: { targetUrl } });
    // Giải link rút gọn ngay lúc này để app Shopee nhận được đường dẫn nó hiểu.
    const appLink = await resolveShopeeAppLink(targetUrl);
    return json(res, 200, { success: true, data: { targetUrl: appLink } });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải quảng cáo" });
  }
};
