const test = require("node:test");
const assert = require("node:assert/strict");

const {
  escapeAttribute,
  isAllowedFacebookUrl,
  isAllowedShopeeUrl,
  isAllowedTikTokUrl,
  sanitizeExternalImageUrl,
} = require("../lib/security");

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
  assert.equal(isAllowedShopeeUrl("https://evilshopee.vn/phish"), false);
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
