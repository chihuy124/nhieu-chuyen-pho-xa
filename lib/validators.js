const crypto = require("crypto");
const { sanitizeArticleHtml } = require("./content");
const { isAllowedFacebookUrl, isAllowedTikTokUrl, normalizeTikTokProductUrl, parseWebUrl, sanitizeExternalImageUrl } = require("./security");
const { FIXED_LOGO_URL } = require("./site-assets");

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function validatePostInput(input, existing = {}) {
  const title = String(input?.title ?? existing.title ?? "").trim();
  if (!title || title.length > 240) throw new Error("Tiêu đề phải có từ 1 đến 240 ký tự");
  const slug = slugify(input?.slug || existing.slug || title);
  if (!slug) throw new Error("Slug không hợp lệ");
  const status = input?.status || existing.status || "draft";
  if (!["draft", "published"].includes(status)) throw new Error("Trạng thái không hợp lệ");
  const publishedAt = String(input?.publishedAt || existing.publishedAt || new Date().toISOString());
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error("Ngày đăng không hợp lệ");
  const coverImage = input?.coverImage ? sanitizeExternalImageUrl(input.coverImage) : (existing.coverImage || "");
  if (input?.coverImage && !coverImage) throw new Error("URL ảnh đại diện không hợp lệ");
  const rawVideos = Array.isArray(input?.videos) ? input.videos : (existing.videos || []);
  const videos = rawVideos.map((value) => parseWebUrl(value)?.toString() || "").filter(Boolean);
  if (videos.length !== rawVideos.length) throw new Error("Danh sách video có URL không hợp lệ");
  const tiktokUrl = normalizeTikTokProductUrl(input?.tiktokUrl || existing.tiktokUrl || "");
  if (tiktokUrl && !isAllowedTikTokUrl(tiktokUrl)) throw new Error("Link TikTok không hợp lệ");
  const id = String(existing.id || input?.id || `post-${crypto.randomBytes(8).toString("hex")}`);
  const date = publishedAt.slice(0, 10);
  return {
    ...existing,
    id,
    title,
    slug,
    excerpt: String(input?.excerpt ?? existing.excerpt ?? "").trim().slice(0, 600),
    contentHtml: sanitizeArticleHtml(input?.contentHtml ?? existing.contentHtml ?? ""),
    coverImage,
    coverAlt: String(input?.coverAlt ?? existing.coverAlt ?? title).trim().slice(0, 240),
    videos,
    tiktokUrl,
    status,
    publishedAt,
    permalink: `/${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/${encodeURIComponent(slug)}/`,
    createdAt: existing.createdAt || new Date().toISOString(),
  };
}

function validateSettingsInput(input, existing) {
  const rawShopeeImage = String(input?.shopeeImageUrl ?? existing.shopeeImageUrl ?? "").trim();
  const isSafeRelativeShopeeImage = rawShopeeImage.startsWith("/") && !rawShopeeImage.startsWith("//");
  const shopeeImageUrl = rawShopeeImage
    ? (isSafeRelativeShopeeImage ? rawShopeeImage : sanitizeExternalImageUrl(rawShopeeImage))
    : "";
  const shopeeUrl = normalizeTikTokProductUrl(input?.shopeeUrl ?? existing.shopeeUrl ?? "");
  const promoOrder = String(input?.promoOrder ?? existing.promoOrder ?? "tiktok-first").trim();
  const fanpageUrl = String(input?.fanpageUrl ?? existing.fanpageUrl ?? "").trim();
  if (!["tiktok-first", "shopee-first"].includes(promoOrder)) throw new Error("Thứ tự popup không hợp lệ");
  const next = {
    ...existing,
    siteTitle: String(input?.siteTitle ?? existing.siteTitle).trim().slice(0, 120),
    siteDescription: String(input?.siteDescription ?? existing.siteDescription).trim().slice(0, 300),
    fanpageUrl,
    logoUrl: FIXED_LOGO_URL,
    promoEnabled: Boolean(input?.promoEnabled),
    promoImageUrl: String(input?.promoImageUrl ?? existing.promoImageUrl).trim(),
    defaultTikTokUrl: normalizeTikTokProductUrl(input?.defaultTikTokUrl ?? existing.defaultTikTokUrl),
    shopeeEnabled: Boolean(input?.shopeeEnabled),
    shopeeImageUrl,
    shopeeUrl,
    promoOrder,
  };
  if (!next.siteTitle) throw new Error("Tên website không được để trống");
  if (fanpageUrl && !isAllowedFacebookUrl(fanpageUrl)) throw new Error("Link Fanpage Facebook không hợp lệ");
  const isSafeRelativeBanner = next.promoImageUrl.startsWith("/") && !next.promoImageUrl.startsWith("//");
  if (!isSafeRelativeBanner && !sanitizeExternalImageUrl(next.promoImageUrl)) {
    throw new Error("URL banner không hợp lệ");
  }
  if (!isAllowedTikTokUrl(next.defaultTikTokUrl)) throw new Error("Link TikTok mặc định không hợp lệ");
  if (rawShopeeImage && !shopeeImageUrl) throw new Error("URL banner TikTok 2 không hợp lệ");
  if (shopeeUrl && !isAllowedTikTokUrl(shopeeUrl)) throw new Error("Link TikTok thứ 2 không hợp lệ");
  if (next.shopeeEnabled && (!shopeeImageUrl || !isAllowedTikTokUrl(shopeeUrl))) {
    throw new Error("Hãy nhập URL banner và link TikTok thứ 2 hợp lệ trước khi bật popup TikTok thứ 2");
  }
  return next;
}

module.exports = { slugify, validatePostInput, validateSettingsInput };
