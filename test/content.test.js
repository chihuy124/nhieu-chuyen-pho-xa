const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getWordPressRedirectTarget,
  normalizeWordPressPost,
  sanitizeArticleHtml,
} = require("../lib/content");

test("WordPress post normalization extracts video and embedded media", () => {
  const post = normalizeWordPressPost({
    id: 7651,
    slug: "kho-than-a-ck",
    link: "https://nhieuchuyenduongpho.com/2026/08/08/kho-than-a-ck/",
    date: "2026-08-08T12:00:00",
    modified: "2026-08-08T12:30:00",
    title: { rendered: "Khổ thân a ck" },
    excerpt: { rendered: "<p>Mô tả ngắn</p>" },
    content: {
      rendered: '<p onclick="alert(1)">Nội dung</p><script>alert(2)</script><video controls><source src="https://nhieuchuyenduongpho.com/wp-content/uploads/a.mp4" type="video/mp4"></video>',
    },
    _embedded: {
      "wp:featuredmedia": [{ source_url: "https://nhieuchuyenduongpho.com/cover.jpg", alt_text: "Ảnh bìa" }],
    },
  });

  assert.equal(post.sourceId, 7651);
  assert.equal(post.slug, "kho-than-a-ck");
  assert.equal(post.title, "Khổ thân a ck");
  assert.equal(post.coverImage, "https://nhieuchuyenduongpho.com/cover.jpg");
  assert.deepEqual(post.videos, ["https://nhieuchuyenduongpho.com/wp-content/uploads/a.mp4"]);
  assert.doesNotMatch(post.contentHtml, /script|onclick/i);
  assert.match(post.contentHtml, /<video/);
});

test("article sanitizer removes active content and unsafe URLs", () => {
  const clean = sanitizeArticleHtml('<p><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(2)"><iframe src="https://evil.example"></iframe></p>');
  assert.doesNotMatch(clean, /javascript:|onerror|iframe/i);
  assert.match(clean, /<p>/);
});

test("normalizer applies safe fallbacks and deduplicates videos", () => {
  const post = normalizeWordPressPost({
    id: 8,
    content: { rendered: '<video src="https://cdn.example/a.mp4"></video><source src="https://cdn.example/a.mp4">' },
  });
  assert.equal(post.slug, "post-8");
  assert.equal(post.title, "Bài viết chưa có tiêu đề");
  assert.equal(post.permalink, "/post/post-8");
  assert.equal(post.coverImage, "");
  assert.deepEqual(post.videos, ["https://cdn.example/a.mp4"]);
  assert.throws(() => normalizeWordPressPost(null), /không hợp lệ/);
});

test("WordPress IDs are namespaced for the Hóng Hớt Đường source", () => {
  const post = normalizeWordPressPost({
    id: 30256,
    slug: "chiec-xe-amanh-nhat-luc-nay",
    link: "https://honghotduong.com/2026/08/09/chiec-xe-amanh-nhat-luc-nay/",
    date: "2026-08-09T20:52:31",
    title: { rendered: "Chiếc xe" },
    content: { rendered: '<video src="https://cdn.videy.co/V6P4o2LX1.mp4"></video>' },
  });
  assert.equal(post.id, "wp-honghotduong-com-30256");
  assert.deepEqual(post.videos, ["https://cdn.videy.co/V6P4o2LX1.mp4"]);
});

test("Hongbienpro posts use a source namespace and redirect wrappers are detected safely", () => {
  const targetUrl = "https://hongbienpro.com/2026/08/11/bai-noi-dung-that/";
  const wrapper = {
    id: 20460,
    slug: "nhan-vien-3",
    link: "https://hongbienpro.com/2026/08/11/nhan-vien-3/",
    date: "2026-08-11T20:10:07",
    title: { rendered: "Nhân viên…" },
    content: { rendered: `<!DOCTYPE html><script>const redirectURL = "${targetUrl}";</script><button onclick="redirectToURL()">TIẾP TỤC XEM</button>` },
  };
  const post = normalizeWordPressPost(wrapper);
  assert.equal(post.id, "wp-hongbienpro-com-20460");
  assert.equal(getWordPressRedirectTarget(wrapper), targetUrl);
  assert.equal(getWordPressRedirectTarget({
    ...wrapper,
    content: { rendered: '<script>const redirectURL = "https://evil.example/phishing";</script>' },
  }), "");
  assert.equal(getWordPressRedirectTarget({
    ...wrapper,
    content: { rendered: '<p>const redirectURL = "https://hongbienpro.com/not-a-wrapper";</p>' },
  }), "");
});

test("WordPress percent-encoded slugs are decoded before creating the permalink", () => {
  const encodedSlug = "%e2%9d%97%ef%b8%8fngay-luc-nay-%f0%9f%99%8f";
  const post = normalizeWordPressPost({
    id: 20443,
    slug: encodedSlug,
    link: `https://hongbienpro.com/2026/08/11/${encodedSlug}/`,
    date: "2026-08-11T13:58:00",
    title: { rendered: "Bài có emoji" },
    content: { rendered: '<video src="https://cdn.videy.co/OAi85XxT1.mp4"></video>' },
  });
  assert.equal(post.slug, "❗️ngay-luc-nay-🙏");
  assert.equal(post.permalink, "/2026/08/11/%E2%9D%97%EF%B8%8Fngay-luc-nay-%F0%9F%99%8F/");
  assert.doesNotMatch(post.permalink, /%25/i);
});
