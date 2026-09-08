const { getSettings } = require("../../lib/content-store");
const { json, requireMethod } = require("../../lib/http");
const { isAllowedTikTokUrl, normalizeTikTokProductUrl, sanitizeExternalImageUrl } = require("../../lib/security");
const { get } = require("../../api/shim/store");
const { isMobileUserAgent } = require("../../lib/user-agent");
const { banner2Platform, resolveBanner2Target } = require("../../lib/promo");
const { createPromoToken } = require("../../lib/promo-token");

function followUpFromSettings(settings, promoEnabled, campaignId) {
  const rawImage = String(settings.shopeeImageUrl || "").trim();
  const isSafeRelativeImage = rawImage.startsWith("/") && !rawImage.startsWith("//");
  const imageUrl = isSafeRelativeImage ? rawImage : sanitizeExternalImageUrl(rawImage);
  const platform = banner2Platform(settings);
  const enabled = Boolean(promoEnabled && settings.shopeeEnabled && imageUrl && resolveBanner2Target(settings));
  // Link thật chỉ được cấp qua promo-target sau khi máy vượt được vòng kiểm tra thiết bị.
  const token = enabled ? createPromoToken({ banner: "banner2", campaignId }) : "";
  return {
    enabled: Boolean(enabled && token),
    imageUrl,
    token,
    platform,
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
    // Chỉ máy di động mới mở được app TikTok, nơi cú bấm gắn được vào tài khoản.
    const promoEnabled = Boolean(settings.promoEnabled && isMobileUserAgent(req.headers?.["user-agent"]));
    if (campaignId === "default") {
      if (!isAllowedTikTokUrl(settings.defaultTikTokUrl)) {
        return json(res, 404, { success: false, error: "Campaign không hợp lệ" });
      }
      return json(res, 200, {
        success: true,
        data: {
          campaignId,
          enabled: promoEnabled,
          imageUrl: settings.promoImageUrl,
          tiktokUrl: normalizeTikTokProductUrl(settings.defaultTikTokUrl),
          promoOrder: promoOrderFromSettings(settings),
          followUp: followUpFromSettings(settings, promoEnabled, campaignId),
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
        enabled: promoEnabled,
        imageUrl: settings.promoImageUrl,
        tiktokUrl: normalizeTikTokProductUrl(tiktokUrl),
        promoOrder: promoOrderFromSettings(settings),
        followUp: followUpFromSettings(settings, promoEnabled, campaignId),
      },
    });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải quảng cáo" });
  }
};
