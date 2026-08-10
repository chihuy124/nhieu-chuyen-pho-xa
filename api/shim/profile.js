const { getPostBySlug } = require("../../lib/content-store");
const { escapeAttribute, isAllowedTikTokUrl, sanitizeExternalImageUrl } = require("../../lib/security");
const { isInAppBrowserUserAgent, isSocialBotUserAgent } = require("../../lib/user-agent");
const { get } = require("./store");

const FALLBACK_TIKTOK = "https://www.tiktok.com/";

function defaultShareImage() {
  try { return new URL("/assets/ncdp-street-icon.png", process.env.PUBLIC_SITE_URL).toString(); }
  catch (_error) { return "https://nhieu-chuyen-pho-xa.vercel.app/assets/ncdp-street-icon.png"; }
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function withCampaign(permalink, id) {
  const url = new URL(permalink, "https://placeholder.invalid");
  url.searchParams.set("promo", id);
  return `${url.pathname}${url.search}`;
}

module.exports = async (req, res) => {
  const id = typeof req.query?.id === "string" ? req.query.id.trim() : "";
  if (!id) return redirect(res, FALLBACK_TIKTOK);

  const record = await get(id);
  if (!record) return redirect(res, FALLBACK_TIKTOK);

  const legacyUrl = typeof record === "string" ? record : record.tiktokUrl;
  const tiktokUrl = isAllowedTikTokUrl(legacyUrl) ? legacyUrl : FALLBACK_TIKTOK;
  const post = typeof record === "object" && record.postSlug
    ? await getPostBySlug(record.postSlug)
    : null;

  const userAgent = req.headers["user-agent"] || "";
  const isIAB = isInAppBrowserUserAgent(userAgent);
  const isBot = isSocialBotUserAgent(userAgent);

  if (!isIAB && !isBot) {
    if (post?.status === "published") return redirect(res, withCampaign(post.permalink, id));
    return redirect(res, tiktokUrl);
  }

  const title = post?.title || "Xem video trên TikTok";
  const description = post?.excerpt || "Mở bằng trình duyệt để xem nội dung đầy đủ.";
  const image = sanitizeExternalImageUrl(post?.coverImage) || defaultShareImage();
  const escapeScript = isIAB
    ? `<script src="/assets/inappbrowserescaper.js"></script><script src="/assets/escape-in-app.js?v=3"></script>`
    : "";
  const manualFallback = isIAB
    ? `<button class="fallback" type="button" data-open-external>Nếu chưa tự mở, chạm để mở trình duyệt</button>`
    : "";

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeAttribute(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}" />
  <meta property="og:title" content="${escapeAttribute(title)}" />
  <meta property="og:description" content="${escapeAttribute(description)}" />
  <meta property="og:image" content="${escapeAttribute(image)}" />
  <meta property="og:type" content="article" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <link rel="icon" href="/assets/ncdp-street-icon.webp" type="image/webp" />
  <link rel="stylesheet" href="/assets/redirect.css?v=2" />
</head>
<body>
  <main class="card">
    <img src="${escapeAttribute(image)}" alt="" />
    <h1>${escapeAttribute(title)}</h1>
    <p>Đang mở nội dung bằng trình duyệt…</p>
    ${manualFallback}
  </main>
  ${escapeScript}
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.end(html);
};

module.exports.withCampaign = withCampaign;
