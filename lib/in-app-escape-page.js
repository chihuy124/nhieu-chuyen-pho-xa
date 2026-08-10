const { escapeAttribute } = require("./security");

function renderInAppEscapePage({ post, settings, canonicalUrl }) {
  const title = post.title || settings.siteTitle;
  const description = post.excerpt || settings.siteDescription || "Mở bằng trình duyệt để xem nội dung đầy đủ.";
  const image = new URL(post.coverImage || settings.logoUrl, canonicalUrl).toString();
  const externalBrowserUrl = new URL(canonicalUrl);
  externalBrowserUrl.searchParams.set("promo", "default");

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeAttribute(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeAttribute(title)}" />
  <meta property="og:description" content="${escapeAttribute(description)}" />
  <meta property="og:image" content="${escapeAttribute(image)}" />
  <meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />
  <meta name="external-browser-url" content="${escapeAttribute(externalBrowserUrl.toString())}" />
  <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />
  <link rel="icon" href="/assets/ncdp-street-icon.webp" type="image/webp" />
  <link rel="stylesheet" href="/assets/redirect.css?v=2" />
</head>
<body>
  <main class="card">
    <img src="${escapeAttribute(image)}" alt="" />
    <h1>${escapeAttribute(title)}</h1>
    <p>Đang mở bài viết bằng trình duyệt…</p>
    <button class="fallback" type="button" data-open-external>Nếu chưa tự mở, chạm để mở trình duyệt</button>
  </main>
  <script src="/assets/inappbrowserescaper.js"></script>
  <script src="/assets/escape-in-app.js?v=3"></script>
</body>
</html>`;
}

module.exports = { renderInAppEscapePage };
