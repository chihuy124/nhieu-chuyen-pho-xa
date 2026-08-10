const { renderArticlePage } = require("../../lib/article-page");
const { getPostBySlug, getSettings } = require("../../lib/content-store");
const { renderInAppEscapePage } = require("../../lib/in-app-escape-page");
const { publicOrigin } = require("../../lib/public-origin");
const { isInAppBrowserUserAgent } = require("../../lib/user-agent");

module.exports = async (req, res) => {
  const slug = String(req.query?.slug || "").trim();
  const [post, settings] = await Promise.all([getPostBySlug(slug), getSettings()]);
  if (!post || post.status !== "published") {
    res.statusCode = 404;
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end("<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><title>Không tìm thấy bài viết</title><body><h1>Không tìm thấy bài viết</h1><p><a href=\"/\">Về trang chủ</a></p></body></html>");
  }
  const canonicalUrl = `${publicOrigin(req)}${post.permalink}`;
  const userAgent = req.headers["user-agent"] || "";
  const html = isInAppBrowserUserAgent(userAgent)
    ? renderInAppEscapePage({ post, settings, canonicalUrl })
    : renderArticlePage({ post, settings, canonicalUrl });
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("vary", "User-Agent");
  res.setHeader("x-content-type-options", "nosniff");
  return res.end(html);
};
