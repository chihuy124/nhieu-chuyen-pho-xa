const test = require("node:test");
const assert = require("node:assert/strict");

const loginHandler = require("../lib/api-admin/login");
const postsHandler = require("../lib/api-admin/posts");
const publicPostHandler = require("../lib/api-content/post");
const promoHandler = require("../lib/api-content/promo");
const createShimHandler = require("../api/shim/create");
const profileHandler = require("../api/shim/profile");
const shimStore = require("../api/shim/store");
const { createSessionToken } = require("../lib/auth");
const { DEFAULT_SETTINGS } = require("../lib/content-store");
const { readJson, requireMethod, requireMutationHeader } = require("../lib/http");
const { slugify, validatePostInput, validateSettingsInput } = require("../lib/validators");

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    writeHead(code, headers = {}) { this.statusCode = code; Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value)); },
    end(value = "") { this.body += value; },
  };
}

function req(method, options = {}) {
  return {
    method,
    body: options.body,
    query: options.query || {},
    headers: {
      cookie: options.cookie || "",
      "user-agent": options.userAgent || "",
      "x-forwarded-for": options.ip || "10.0.0.2",
      host: "example.test",
      origin: "https://example.test",
      "x-forwarded-proto": "https",
      ...(options.mutation ? { "x-admin-request": "1" } : {}),
    },
  };
}

test("HTTP helpers cover method, mutation and body variants", async () => {
  const allowed = response();
  assert.equal(requireMethod(req("GET"), allowed, ["GET"]), true);
  const denied = response();
  assert.equal(requireMethod(req("PATCH"), denied, ["GET"]), false);
  assert.equal(denied.statusCode, 405);
  const mutationDenied = response();
  assert.equal(requireMutationHeader(req("POST"), mutationDenied), false);
  assert.equal(requireMutationHeader(req("POST", { mutation: true }), response()), true);
  const forgedOrigin = req("POST", { mutation: true });
  forgedOrigin.headers.origin = "https://evil.example";
  const forgedOriginResponse = response();
  assert.equal(requireMutationHeader(forgedOrigin, forgedOriginResponse), false);
  assert.equal(forgedOriginResponse.statusCode, 403);
  const insecureOrigin = req("POST", { mutation: true });
  insecureOrigin.headers.origin = "http://example.test";
  assert.equal(requireMutationHeader(insecureOrigin, response()), false);
  assert.deepEqual(await readJson({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(await readJson({ body: '{"a":2}' }), { a: 2 });
  assert.deepEqual(await readJson({}), {});
  const stream = { async *[Symbol.asyncIterator]() { yield Buffer.from('{"a":'); yield Buffer.from("3}"); } };
  assert.deepEqual(await readJson(stream), { a: 3 });
});

test("validators reject unsafe values and normalize immutable post copies", () => {
  assert.equal(slugify("  Chuyện Đường Phố! "), "chuyen-duong-pho");
  assert.throws(() => validatePostInput({ title: "" }), /Tiêu đề/);
  assert.throws(() => validatePostInput({ title: "x", status: "deleted" }), /Trạng thái/);
  assert.throws(() => validatePostInput({ title: "x", publishedAt: "bad" }), /Ngày đăng/);
  assert.throws(() => validatePostInput({ title: "x", coverImage: "javascript:x" }), /ảnh đại diện/);
  assert.throws(() => validatePostInput({ title: "x", videos: ["bad"] }), /video/);
  assert.throws(() => validatePostInput({ title: "x", tiktokUrl: "https://example.com" }), /TikTok/);
  const existing = { id: "fixed", title: "Old", slug: "old", status: "draft", publishedAt: "2026-01-01T00:00:00Z", createdAt: "then", videos: [] };
  const updated = validatePostInput({ title: "New" }, existing);
  assert.equal(existing.title, "Old");
  assert.equal(updated.title, "New");
  assert.equal(updated.id, "fixed");

  assert.throws(() => validateSettingsInput({ siteTitle: "" }, DEFAULT_SETTINGS), /Tên website/);
  assert.equal(validateSettingsInput({ logoUrl: "bad" }, DEFAULT_SETTINGS).logoUrl, DEFAULT_SETTINGS.logoUrl);
  assert.equal(validateSettingsInput({ logoUrl: "//evil.example/x" }, DEFAULT_SETTINGS).logoUrl, DEFAULT_SETTINGS.logoUrl);
  assert.equal(validateSettingsInput({ logoUrl: "/assets/ncdp-street-icon.webp" }, DEFAULT_SETTINGS).logoUrl, "/assets/ncdp-street-icon.webp");
  assert.throws(() => validateSettingsInput({ promoImageUrl: "//evil.example/x" }, DEFAULT_SETTINGS), /banner/);
  assert.throws(() => validateSettingsInput({ defaultTikTokUrl: "https://example.com" }, DEFAULT_SETTINGS), /TikTok/);
  assert.equal(validateSettingsInput({ promoEnabled: false }, DEFAULT_SETTINGS).promoEnabled, false);
  assert.equal(
    validateSettingsInput({ fanpageUrl: "https://www.facebook.com/nhieuchuyenphoxa" }, DEFAULT_SETTINGS).fanpageUrl,
    "https://www.facebook.com/nhieuchuyenphoxa",
  );
  assert.equal(validateSettingsInput({ fanpageUrl: "" }, DEFAULT_SETTINGS).fanpageUrl, "");
  assert.throws(() => validateSettingsInput({ fanpageUrl: "https://evil.example/facebook" }, DEFAULT_SETTINGS), /Fanpage/);
  assert.throws(() => validateSettingsInput({ fanpageUrl: "https://evilfacebook.com/page" }, DEFAULT_SETTINGS), /Fanpage/);
  const shopeeSettings = validateSettingsInput({
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-banner.webp",
    shopeeUrl: "https://s.shopee.vn/AbCd12",
    promoOrder: "shopee-first",
  }, DEFAULT_SETTINGS);
  assert.equal(shopeeSettings.shopeeEnabled, true);
  assert.equal(shopeeSettings.shopeeImageUrl, "/assets/shopee-banner.webp");
  assert.equal(shopeeSettings.shopeeUrl, "https://s.shopee.vn/AbCd12");
  assert.equal(shopeeSettings.promoOrder, "shopee-first");
  assert.throws(() => validateSettingsInput({ promoOrder: "random-first" }, DEFAULT_SETTINGS), /Thứ tự popup/);
  assert.throws(() => validateSettingsInput({ shopeeEnabled: true, shopeeImageUrl: "", shopeeUrl: "" }, DEFAULT_SETTINGS), /Shopee/);
  assert.throws(() => validateSettingsInput({ shopeeEnabled: true, shopeeImageUrl: "/banner.webp", shopeeUrl: "https://evil.example" }, DEFAULT_SETTINGS), /Shopee/);
});

test("API error paths and legacy shim behavior are safe", async () => {
  const oldPassword = process.env.ADMIN_PASSWORD;
  const oldSecret = process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  const unconfigured = response();
  await loginHandler(req("POST", { body: {}, mutation: true }), unconfigured);
  assert.equal(unconfigured.statusCode, 503);

  process.env.ADMIN_PASSWORD = "edge-password";
  process.env.ADMIN_SESSION_SECRET = "edge-secret-long-enough-for-32-characters";
  const wrong = response();
  await loginHandler(req("POST", { body: { password: "wrong" }, mutation: true, ip: "10.0.0.99" }), wrong);
  assert.equal(wrong.statusCode, 401);
  const cookie = `admin_session=${createSessionToken(process.env.ADMIN_SESSION_SECRET)}`;

  const listRes = response();
  await postsHandler(req("GET", { cookie }), listRes);
  assert.equal(listRes.statusCode, 200);
  const invalidPost = response();
  await postsHandler(req("POST", { cookie, mutation: true, body: { title: "" } }), invalidPost);
  assert.equal(invalidPost.statusCode, 422);

  const missingPost = response();
  await publicPostHandler(req("GET", { query: { slug: "definitely-missing" } }), missingPost);
  assert.equal(missingPost.statusCode, 404);
  const invalidPromo = response();
  await promoHandler(req("GET", { query: { campaign: "bad" } }), invalidPromo);
  assert.equal(invalidPromo.statusCode, 404);

  const badShim = response();
  await createShimHandler(req("POST", { cookie, mutation: true, body: { postSlug: "x", url: "https://eviltiktok.com" } }), badShim);
  assert.equal(badShim.statusCode, 400);
  const missingSlug = response();
  await createShimHandler(req("POST", { cookie, mutation: true, body: { url: "https://www.tiktok.com/" } }), missingSlug);
  assert.equal(missingSlug.statusCode, 400);

  const noId = response();
  await profileHandler(req("GET"), noId);
  assert.equal(noId.statusCode, 302);
  await shimStore.put("legacy000001", "https://www.tiktok.com/@demo/video/1");
  const legacy = response();
  await profileHandler(req("GET", { query: { id: "legacy000001" }, userAgent: "Chrome" }), legacy);
  assert.equal(legacy.headers.location, "https://www.tiktok.com/@demo/video/1");
  const iab = response();
  await profileHandler(req("GET", { query: { id: "legacy000001" }, userAgent: "FBAN/FBIOS" }), iab);
  assert.equal(iab.statusCode, 200);
  assert.match(iab.body, /inappbrowserescaper\.js/);

  const modernFacebookIab = response();
  await profileHandler(req("GET", {
    query: { id: "legacy000001" },
    userAgent: "Mozilla/5.0 (Linux; Android 15; wv) FB_IAB/FB4A",
  }), modernFacebookIab);
  assert.equal(modernFacebookIab.statusCode, 200);
  assert.match(modernFacebookIab.body, /inappbrowserescaper\.js/);
  assert.match(modernFacebookIab.body, /escape-in-app\.js\?v=3/);
  assert.match(modernFacebookIab.body, /data-open-external/);

  if (oldPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = oldPassword;
  if (oldSecret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = oldSecret;
});
