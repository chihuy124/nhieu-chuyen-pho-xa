const { getSettings } = require("../../lib/content-store");
const { json, requireMethod } = require("../../lib/http");
const { isAllowedTikTokUrl, sanitizeExternalImageUrl } = require("../../lib/security");
const { get } = require("../../api/shim/store");

function followUpFromSettings(settings) {
  const rawImage = String(settings.shopeeImageUrl || "").trim();
  const isSafeRelativeImage = rawImage.startsWith("/") && !rawImage.startsWith("//");
  const imageUrl = isSafeRelativeImage ? rawImage : sanitizeExternalImageUrl(rawImage);
  const targetUrl = isAllowedTikTokUrl(settings.shopeeUrl) ? String(settings.shopeeUrl) : "";
  return {
    enabled: Boolean(settings.shopeeEnabled && imageUrl && targetUrl),
    imageUrl,
    targetUrl,
    delayMs: 1000,
  };
}

function promoOrderFromSettings(settings) {
  return settings.promoOrder === "shopee-first" ? "shopee-first" : "tiktok-first";
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const campaignId = String(req.query?.campaign || "").trim();
    const settings = await getSettings();
    if (campaignId === "default") {
      if (!isAllowedTikTokUrl(settings.defaultTikTokUrl)) {
        return json(res, 404, { success: false, error: "Campaign không hợp lệ" });
      }
      return json(res, 200, {
        success: true,
        data: {
          campaignId,
          enabled: settings.promoEnabled,
          imageUrl: settings.promoImageUrl,
          tiktokUrl: settings.defaultTikTokUrl,
          promoOrder: promoOrderFromSettings(settings),
          followUp: followUpFromSettings(settings),
        },
      });
    }
    if (!/^[a-f0-9]{12,32}$/i.test(campaignId)) return json(res, 404, { success: false, error: "Campaign không hợp lệ" });
    const record = await get(campaignId);
    if (!record) return json(res, 404, { success: false, error: "Campaign không tồn tại" });
    const tiktokUrl = typeof record === "string" ? record : record.tiktokUrl;
    if (!isAllowedTikTokUrl(tiktokUrl)) return json(res, 404, { success: false, error: "Campaign không hợp lệ" });
    return json(res, 200, {
      success: true,
      data: {
        campaignId,
        enabled: settings.promoEnabled,
        imageUrl: settings.promoImageUrl,
        tiktokUrl,
        promoOrder: promoOrderFromSettings(settings),
        followUp: followUpFromSettings(settings),
      },
    });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải quảng cáo" });
  }
};
