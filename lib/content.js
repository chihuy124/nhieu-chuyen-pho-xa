const sanitizeHtml = require("sanitize-html");
const { sanitizeExternalImageUrl } = require("./security");

const SOURCE_ID_NAMESPACES = Object.freeze({
  "https://honghotduong.com": "honghotduong-com",
  "https://hongbienpro.com": "hongbienpro-com",
});

const SANITIZE_OPTIONS = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote",
    "h2", "h3", "h4", "ul", "ol", "li", "figure", "figcaption",
    "img", "video", "source", "a", "span", "div",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading", "srcset", "sizes"],
    video: ["src", "poster", "controls", "playsinline", "preload", "width", "height"],
    source: ["src", "type"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https"],
  allowedSchemesAppliedToAttributes: ["href", "src", "poster"],
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attrs) => ({
      tagName: "a",
      attribs: {
        ...attrs,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }),
    img: (_tagName, attrs) => ({
      tagName: "img",
      attribs: { ...attrs, loading: "lazy" },
    }),
    video: (_tagName, attrs) => ({
      tagName: "video",
      attribs: { ...attrs, controls: "", playsinline: "", preload: "metadata" },
    }),
  },
};

function sanitizeArticleHtml(value) {
  return sanitizeHtml(String(value || ""), SANITIZE_OPTIONS);
}

function textFromHtml(value) {
  return sanitizeHtml(String(value || ""), { allowedTags: [], allowedAttributes: {} }).trim();
}

function decodeWordPressSlug(value) {
  const slug = String(value || "").trim();
  if (!/%[0-9a-f]{2}/i.test(slug)) return slug;
  try { return decodeURIComponent(slug); } catch (_error) { return slug; }
}

function buildPostPermalink(slug, date) {
  const encodedSlug = encodeURIComponent(String(slug || ""));
  return date && /^\d{4}-\d{2}-\d{2}/.test(date)
    ? `/${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/${encodedSlug}/`
    : `/post/${encodedSlug}`;
}

function extractVideoUrls(html) {
  const clean = sanitizeArticleHtml(html);
  const urls = [];
  const pattern = /<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(clean))) {
    const url = sanitizeExternalImageUrl(match[1]);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function getWordPressRedirectTarget(source) {
  const html = String(source?.content?.rendered || "");
  if (!/<!doctype\s+html/i.test(html) || !/<script\b/i.test(html)) return "";
  const match = html.match(/\b(?:const|let|var)\s+redirectURL\s*=\s*(["'])(https:\/\/[^"'<>\s]+)\1\s*;/i);
  if (!match) return "";
  try {
    const sourceUrl = new URL(String(source?.link || ""));
    const targetUrl = new URL(match[2]);
    if (
      sourceUrl.protocol !== "https:"
      || targetUrl.protocol !== "https:"
      || targetUrl.username
      || targetUrl.password
      || targetUrl.origin !== sourceUrl.origin
    ) return "";
    return targetUrl.toString();
  } catch (_error) {
    return "";
  }
}

function wordpressStorageId(source) {
  const baseId = `wp-${source.id}`;
  try {
    const origin = new URL(String(source.link || "")).origin;
    const namespace = SOURCE_ID_NAMESPACES[origin];
    return namespace ? `wp-${namespace}-${source.id}` : baseId;
  } catch (_error) {
    return baseId;
  }
}

function normalizeWordPressPost(source) {
  if (!source || !Number.isInteger(Number(source.id))) throw new Error("Bài viết nguồn không hợp lệ");
  const featured = source._embedded?.["wp:featuredmedia"]?.[0] || {};
  const contentHtml = sanitizeArticleHtml(source.content?.rendered);
  const date = String(source.date || "");
  const slug = decodeWordPressSlug(source.slug || `post-${source.id}`);
  return {
    id: wordpressStorageId(source),
    sourceId: Number(source.id),
    sourceUrl: sanitizeExternalImageUrl(source.link),
    slug,
    permalink: buildPostPermalink(slug, date),
    title: textFromHtml(source.title?.rendered) || "Bài viết chưa có tiêu đề",
    excerpt: textFromHtml(source.excerpt?.rendered),
    contentHtml,
    coverImage: sanitizeExternalImageUrl(featured.source_url),
    coverAlt: textFromHtml(featured.alt_text),
    videos: extractVideoUrls(contentHtml),
    status: "published",
    publishedAt: date,
    modifiedAt: String(source.modified || date),
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  buildPostPermalink,
  decodeWordPressSlug,
  extractVideoUrls,
  getWordPressRedirectTarget,
  normalizeWordPressPost,
  sanitizeArticleHtml,
  textFromHtml,
};
