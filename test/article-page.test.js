const test = require("node:test");
const assert = require("node:assert/strict");

const { renderArticlePage } = require("../lib/article-page");
const { renderInAppEscapePage } = require("../lib/in-app-escape-page");
const { publicOrigin } = require("../lib/public-origin");
const { isInAppBrowserUserAgent, isSocialBotUserAgent } = require("../lib/user-agent");

test("canonical origin comes from trusted configuration, not a hostile Host header", () => {
  const previousSiteUrl = process.env.PUBLIC_SITE_URL;
  const previousVercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.PUBLIC_SITE_URL = "https://news.example.com/base/path";
  try {
    assert.equal(publicOrigin({ headers: { host: "evil.example" } }), "https://news.example.com");
    process.env.PUBLIC_SITE_URL = "ftp://news.example.com";
    assert.throws(() => publicOrigin({ headers: {} }), /không hợp lệ/);
    delete process.env.PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "project.vercel.app";
    assert.equal(publicOrigin({ headers: { host: "evil.example" } }), "https://project.vercel.app");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.NODE_ENV = "development";
    assert.equal(publicOrigin({ headers: { host: "localhost:3000", "x-forwarded-proto": "https" } }), "https://localhost:3000");
    assert.equal(publicOrigin({ headers: { host: "bad/host" } }), "http://localhost:3000");
    process.env.NODE_ENV = "production";
    assert.throws(() => publicOrigin({ headers: {} }), /Thiếu PUBLIC_SITE_URL/);
  } finally {
    if (previousSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = previousSiteUrl;
    if (previousVercelUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previousVercelUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("server-rendered article page contains content and escaped Open Graph metadata", () => {
  const html = renderArticlePage({
    post: {
      title: 'Tin "nóng" <test>',
      excerpt: "Mô tả & thêm",
      contentHtml: "<p>Nội dung đã sanitize</p>",
      coverImage: "https://cdn.example.com/cover.jpg",
      coverAlt: "Ảnh bìa",
      publishedAt: "2026-08-09T10:00:00Z",
      videos: ["https://cdn.example.com/video.mp4"],
    },
    settings: {
      siteTitle: "NCDP",
      logoUrl: "https://cdn.example.com/logo.jpg",
      fanpageUrl: "https://www.facebook.com/nhieuchuyenphoxa",
    },
    canonicalUrl: "https://example.com/2026/08/09/tin-nong/",
  });
  assert.match(html, /<meta property="og:title" content="Tin &quot;nóng&quot; &lt;test&gt;"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/2026\/08\/09\/tin-nong\/"/);
  assert.match(html, /Nội dung đã sanitize/);
  assert.match(html, /video\.mp4/);
  assert.doesNotMatch(html, /<title>[^<]*<test>/);
  assert.doesNotMatch(html, /menu-button|site-menu/);
  assert.doesNotMatch(html, /href="\/admin"|>Quản trị</);
  assert.match(html, /class="site-name article-site-name"/);
  assert.match(html, /class="site-name-logo"[^>]*data-site-logo/);
  assert.match(html, /class="article-fanpage"/);
  assert.match(html, /href="https:\/\/www\.facebook\.com\/nhieuchuyenphoxa"/);
  assert.match(html, /FANPAGE: <a[^>]*>THEO DÕI TẠI ĐÂY<\/a>/);
  assert.doesNotMatch(html, /class="article-logo"/);
  assert.match(html, /site\.css\?v=3/);
});

test("article page falls back to site metadata and avoids duplicate embedded video", () => {
  const video = "https://cdn.example.com/inside.mp4";
  const html = renderArticlePage({
    post: {
      title: "Bài tối giản",
      excerpt: "",
      contentHtml: `<video src="${video}"></video>`,
      coverImage: "",
      publishedAt: "not-a-date",
      videos: [video],
    },
    settings: { siteTitle: "NCDP", siteDescription: "Mô tả site", logoUrl: "https://cdn.example.com/logo.jpg" },
    canonicalUrl: "https://example.com/post/minimal",
  });
  assert.match(html, /og:image" content="https:\/\/cdn\.example\.com\/logo\.jpg/);
  assert.match(html, /description" content="Mô tả site/);
  assert.equal((html.match(/inside\.mp4/g) || []).length, 1);
  assert.match(html, /<video[^>]*preload="auto"/);
  assert.match(html, /post\.js\?v=8/);
  assert.match(html, /<img id="promo-image" alt="Khuyến mãi đặc biệt"/);
  assert.doesNotMatch(html, /id="promo-image" src=/);
  assert.doesNotMatch(html, /article-cover/);
  assert.doesNotMatch(html, /article-fanpage/);
});

test("direct article escape page uses safe metadata fallbacks and modern Facebook detection", () => {
  assert.equal(isInAppBrowserUserAgent("FB_IAB/FB4A"), true);
  assert.equal(isInAppBrowserUserAgent(undefined), false);
  assert.equal(isSocialBotUserAgent("facebookexternalhit/1.1"), true);
  assert.equal(isSocialBotUserAgent("Mozilla/5.0 Chrome"), false);

  const html = renderInAppEscapePage({
    post: { title: "", excerpt: "", coverImage: "" },
    settings: { siteTitle: "Phố Xá", siteDescription: "", logoUrl: "/assets/ncdp-street-icon.webp" },
    canonicalUrl: "https://example.com/2026/08/09/bai-viet/",
  });
  assert.match(html, /<title>Phố Xá<\/title>/);
  assert.match(html, /Mở bằng trình duyệt để xem nội dung đầy đủ/);
  assert.match(html, /https:\/\/example\.com\/assets\/ncdp-street-icon\.webp/);
  assert.match(html, /name="external-browser-url" content="https:\/\/example\.com\/2026\/08\/09\/bai-viet\/\?promo=default"/);
  assert.match(html, /escape-in-app\.js\?v=3/);
  assert.match(html, /data-open-external/);
});
