const { escapeAttribute, isAllowedFacebookUrl } = require("./security");

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function prioritizeFirstVideo(html) {
  return String(html || "").replace(/<video\b([^>]*)>/i, (_tag, attributes) => {
    const withoutPreload = attributes.replace(/\s+preload=(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `<video${withoutPreload} preload="auto">`;
  });
}

function renderFanpageCallToAction(settings) {
  if (!isAllowedFacebookUrl(settings.fanpageUrl)) return "";
  return `<p class="article-fanpage">FANPAGE: <a href="${escapeAttribute(settings.fanpageUrl)}" target="_blank" rel="noopener noreferrer">THEO DÕI TẠI ĐÂY</a></p>`;
}

function renderArticlePage({ post, settings, canonicalUrl }) {
  const image = new URL(post.coverImage || settings.logoUrl, canonicalUrl).toString();
  const contentHtml = prioritizeFirstVideo(post.contentHtml);
  const hasEmbeddedVideo = /<video\b/i.test(contentHtml);
  const videos = (post.videos || [])
    .filter((url) => !contentHtml.includes(url))
    .map((url, index) => `<video class="article-video" src="${escapeAttribute(url)}" controls playsinline preload="${!hasEmbeddedVideo && index === 0 ? "auto" : "metadata"}"></video>`)
    .join("");
  const cover = post.coverImage
    ? `<img class="article-cover" src="${escapeAttribute(post.coverImage)}" alt="${escapeAttribute(post.coverAlt || "")}" />`
    : "";
  const excerpt = post.excerpt ? `<p class="article-excerpt">${escapeAttribute(post.excerpt)}</p>` : "";
  const fanpageCallToAction = renderFanpageCallToAction(settings);
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>${escapeAttribute(post.title)} – ${escapeAttribute(settings.siteTitle)}</title>
  <meta name="description" content="${escapeAttribute(post.excerpt || settings.siteDescription || "")}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeAttribute(post.title)}" />
  <meta property="og:description" content="${escapeAttribute(post.excerpt || settings.siteDescription || "")}" />
  <meta property="og:image" content="${escapeAttribute(image)}" />
  <meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />
  <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />
  <link rel="icon" href="/assets/ncdp-street-icon.webp" type="image/webp" />
  <link rel="apple-touch-icon" href="/assets/ncdp-street-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/site.css?v=3" />
</head>
<body>
  <a class="skip-link" href="#content">Chuyển đến phần nội dung</a>
  <header class="site-header">
    <a class="site-name article-site-name" href="/">
      <img class="site-name-logo" data-site-logo src="${escapeAttribute(settings.logoUrl)}" alt="" />
      <span data-site-title>${escapeAttribute(settings.siteTitle)}</span>
    </a>
  </header>
  <main id="content" class="article-shell">
    <article id="article" aria-live="polite">
      <header class="article-header"><h1>${escapeAttribute(post.title)}</h1><div class="article-meta"><time datetime="${escapeAttribute(post.publishedAt)}">${escapeAttribute(formatDate(post.publishedAt))}</time></div></header>
      ${excerpt}${cover}
      <div class="article-content">${contentHtml}</div>
      ${videos}
      ${fanpageCallToAction}
    </article>
    <div id="article-error" class="empty-state" hidden></div>
  </main>
  <div id="promo-overlay" class="promo-overlay" role="dialog" aria-modal="true" aria-label="Khuyến mãi" hidden>
    <div class="promo-card"><img id="promo-image" alt="Khuyến mãi đặc biệt" /><button id="promo-close" class="promo-close" type="button" aria-label="Mở ưu đãi và đóng quảng cáo">×</button></div>
  </div>
  <script src="/assets/shared.js" defer></script>
  <script src="/assets/post.js?v=9" defer></script>
</body>
</html>`;
}

module.exports = { prioritizeFirstVideo, renderArticlePage, renderFanpageCallToAction };
