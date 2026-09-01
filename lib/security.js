const TIKTOK_HOSTS = ["tiktok.com", "tiktokv.com", "tiktokcdn.com"];
const SHOPEE_HOSTS = ["shopee.vn"];
const FACEBOOK_HOSTS = ["facebook.com", "fb.com"];

function isSameOrSubdomain(hostname, allowedDomain) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return host === allowedDomain || host.endsWith(`.${allowedDomain}`);
}

function parseWebUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch (_error) {
    return null;
  }
}

function isAllowedTikTokUrl(value) {
  const url = parseWebUrl(value);
  return Boolean(
    url
      && url.protocol === "https:"
      && TIKTOK_HOSTS.some((domain) => isSameOrSubdomain(url.hostname, domain)),
  );
}

const TIKTOK_PRODUCT_PATH = /^\/(?:[a-z]{2}\/)?pdp\/(\d{6,32})\/?$/i;
const TIKTOK_VIEW_PRODUCT_PATH = /^\/view\/product\/(\d{6,32})\/?$/i;

function isTikTokProductUrl(value) {
  const url = parseWebUrl(value);
  if (!url || !isSameOrSubdomain(url.hostname, "tiktok.com")) return false;
  return TIKTOK_PRODUCT_PATH.test(url.pathname) || TIKTOK_VIEW_PRODUCT_PATH.test(url.pathname);
}

function normalizeTikTokProductUrl(value) {
  const raw = String(value || "").trim();
  const url = parseWebUrl(raw);
  if (!url || !isSameOrSubdomain(url.hostname, "tiktok.com")) return raw;
  const productId = TIKTOK_PRODUCT_PATH.exec(url.pathname)?.[1];
  if (!productId) return raw;
  url.hostname = "www.tiktok.com";
  url.pathname = `/view/product/${productId}`;
  return url.toString();
}

function isAllowedShopeeUrl(value) {
  const url = parseWebUrl(value);
  return Boolean(
    url
      && url.protocol === "https:"
      && SHOPEE_HOSTS.some((domain) => isSameOrSubdomain(url.hostname, domain)),
  );
}

function isAllowedFacebookUrl(value) {
  const url = parseWebUrl(value);
  return Boolean(
    url
      && url.protocol === "https:"
      && FACEBOOK_HOSTS.some((domain) => isSameOrSubdomain(url.hostname, domain)),
  );
}

function sanitizeExternalImageUrl(value) {
  const url = parseWebUrl(value);
  return url ? url.toString() : "";
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

module.exports = {
  escapeAttribute,
  isAllowedFacebookUrl,
  isAllowedShopeeUrl,
  isAllowedTikTokUrl,
  isSameOrSubdomain,
  isTikTokProductUrl,
  normalizeTikTokProductUrl,
  parseWebUrl,
  sanitizeExternalImageUrl,
};
