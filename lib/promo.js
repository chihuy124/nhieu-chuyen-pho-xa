const { isAllowedShopeeUrl, isAllowedTikTokUrl, normalizeTikTokProductUrl } = require("./security");

function banner2Platform(settings) {
  return settings?.banner2Platform === "shopee" ? "shopee" : "tiktok";
}

// Link banner 2 mang affiliate ID nên chỉ được giải ở server, không gửi kèm lúc tải trang.
function resolveBanner2Target(settings) {
  const platform = banner2Platform(settings);
  const rawTarget = String(settings?.shopeeUrl || "").trim();
  if (platform === "shopee") return isAllowedShopeeUrl(rawTarget) ? rawTarget : "";
  return isAllowedTikTokUrl(rawTarget) ? normalizeTikTokProductUrl(rawTarget) : "";
}

function promoStorageKey(campaignId) {
  return `ncdp:promo-seen:${String(campaignId || "").trim()}`;
}

function shouldShowPromo({ campaignId, enabled, seen }) {
  return Boolean(String(campaignId || "").trim() && enabled && !seen);
}

module.exports = { banner2Platform, promoStorageKey, resolveBanner2Target, shouldShowPromo };
