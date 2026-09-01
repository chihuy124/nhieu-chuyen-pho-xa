const test = require("node:test");
const assert = require("node:assert/strict");

const {
  escapeAttribute,
  isAllowedFacebookUrl,
  isAllowedShopeeUrl,
  isAllowedTikTokUrl,
  normalizeTikTokProductUrl,
  sanitizeExternalImageUrl,
} = require("../lib/security");

test("TikTok shop product links are rewritten to the faster view page", () => {
  const query = "?_d=eh95e03edkac9b&scene=pdp&utm_source=copy";
  assert.equal(
    normalizeTikTokProductUrl(`https://shop.tiktok.com/vn/pdp/1736162251526342591${query}`),
    `https://www.tiktok.com/view/product/1736162251526342591${query}`,
  );
  assert.equal(
    normalizeTikTokProductUrl("https://shop.tiktok.com/vn/pdp/1736162251526342591/"),
    "https://www.tiktok.com/view/product/1736162251526342591",
  );
  assert.equal(
    normalizeTikTokProductUrl("https://shop.tiktok.com/pdp/1729438480898231207"),
    "https://www.tiktok.com/view/product/1729438480898231207",
  );
  assert.equal(isAllowedTikTokUrl(normalizeTikTokProductUrl("https://shop.tiktok.com/vn/pdp/1736162251526342591")), true);
});

test("links that are not TikTok shop product pages are left untouched", () => {
  const alreadyFast = "https://www.tiktok.com/view/product/1729438480898231207?utm_source=copy";
  assert.equal(normalizeTikTokProductUrl(alreadyFast), alreadyFast);
  assert.equal(normalizeTikTokProductUrl("https://vt.tiktok.com/ZS9BfrX47UtRw-Z0BUh/"), "https://vt.tiktok.com/ZS9BfrX47UtRw-Z0BUh/");
  assert.equal(normalizeTikTokProductUrl("https://www.tiktok.com/@nguoidung/video/123"), "https://www.tiktok.com/@nguoidung/video/123");
  assert.equal(normalizeTikTokProductUrl("https://shop.example.com/vn/pdp/1736162251526342591"), "https://shop.example.com/vn/pdp/1736162251526342591");
  assert.equal(normalizeTikTokProductUrl("https://shop.tiktok.com/vn/pdp/khong-phai-so"), "https://shop.tiktok.com/vn/pdp/khong-phai-so");
  assert.equal(normalizeTikTokProductUrl(""), "");
  assert.equal(normalizeTikTokProductUrl("khong-phai-url"), "khong-phai-url");
});

test("Facebook URL policy only accepts HTTPS Facebook pages", () => {
  assert.equal(isAllowedFacebookUrl("https://www.facebook.com/nhieuchuyenphoxa"), true);
  assert.equal(isAllowedFacebookUrl("https://m.facebook.com/nhieuchuyenphoxa"), true);
  assert.equal(isAllowedFacebookUrl("https://fb.com/nhieuchuyenphoxa"), true);
  assert.equal(isAllowedFacebookUrl("https://evilfacebook.com/phish"), false);
  assert.equal(isAllowedFacebookUrl("http://facebook.com/insecure"), false);
  assert.equal(isAllowedFacebookUrl("javascript:alert(1)"), false);
});

test("TikTok URL policy only accepts HTTPS on exact domains or subdomains", () => {
  assert.equal(isAllowedTikTokUrl("https://www.tiktok.com/@demo/video/1"), true);
  assert.equal(isAllowedTikTokUrl("https://vt.tiktok.com/abc"), true);
  assert.equal(isAllowedTikTokUrl("https://p16.tiktokcdn.com/image.jpg"), true);
  assert.equal(isAllowedTikTokUrl("https://eviltiktok.com/phish"), false);
  assert.equal(isAllowedTikTokUrl("http://tiktok.com/insecure"), false);
  assert.equal(isAllowedTikTokUrl("ftp://tiktok.com/file"), false);
  assert.equal(isAllowedTikTokUrl("https://user:pass@tiktok.com/video"), false);
  assert.equal(isAllowedTikTokUrl("not a url"), false);
});

test("Shopee URL policy only accepts HTTPS Vietnamese Shopee domains", () => {
  assert.equal(isAllowedShopeeUrl("https://shopee.vn/product/123/456"), true);
  assert.equal(isAllowedShopeeUrl("https://s.shopee.vn/AbCd12"), true);
  assert.equal(isAllowedShopeeUrl("https://affiliate.shopee.vn/offer"), true);
  assert.equal(isAllowedShopeeUrl("https://shope.ee/AbCd12"), true);
  assert.equal(isAllowedShopeeUrl("https://evilshopee.vn/phish"), false);
  assert.equal(isAllowedShopeeUrl("https://shope.ee.evil.example/phish"), false);
  assert.equal(isAllowedShopeeUrl("http://shopee.vn/insecure"), false);
  assert.equal(isAllowedShopeeUrl("https://shopee.com/product"), false);
});

test("HTML attribute escaping neutralizes metadata injection", () => {
  assert.equal(
    escapeAttribute('Tin \"nóng\" <script>alert(1)</script> & more'),
    "Tin &quot;nóng&quot; &lt;script&gt;alert(1)&lt;/script&gt; &amp; more",
  );
});

test("external image URL only accepts http(s)", () => {
  assert.equal(sanitizeExternalImageUrl("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
  assert.equal(sanitizeExternalImageUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeExternalImageUrl("data:text/html,bad"), "");
});
