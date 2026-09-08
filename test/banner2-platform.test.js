const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.ADMIN_SESSION_SECRET = "banner2-platform-secret-that-is-long-enough";

const promoHandler = require("../lib/api-content/promo");
const { DEFAULT_SETTINGS, saveSettings } = require("../lib/content-store");
const { resolveBanner2Target } = require("../lib/promo");
const { validateSettingsInput } = require("../lib/validators");

const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SHOPEE_URL = "https://shopee.vn/product/123456/7890123";
const TIKTOK_URL = "https://www.tiktok.com/view/product/1736162251526342591";

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(value = "") { this.body += value; },
  };
}

const MACBOOK = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function promoFor(settings, userAgent) {
  await saveSettings(settings);
  const res = response();
  await promoHandler({ method: "GET", query: { campaign: "default" }, headers: { "user-agent": userAgent } }, res);
  return JSON.parse(res.body).data;
}

async function followUpFor(settings) {
  return (await promoFor(settings, ANDROID)).followUp;
}

test("banner 2 accepts a Shopee link once the platform is switched", () => {
  const saved = validateSettingsInput({
    banner2Platform: "shopee",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: SHOPEE_URL,
  }, DEFAULT_SETTINGS);
  assert.equal(saved.banner2Platform, "shopee");
  assert.equal(saved.shopeeUrl, SHOPEE_URL);
  assert.equal(saved.shopeeEnabled, true);
});

test("each platform only accepts links from its own marketplace", () => {
  assert.throws(() => validateSettingsInput({
    banner2Platform: "shopee",
    shopeeUrl: TIKTOK_URL,
  }, DEFAULT_SETTINGS), /Link Shopee cho banner 2 không hợp lệ/);

  assert.throws(() => validateSettingsInput({
    banner2Platform: "tiktok",
    shopeeUrl: SHOPEE_URL,
  }, DEFAULT_SETTINGS), /Link TikTok cho banner 2 không hợp lệ/);

  assert.throws(() => validateSettingsInput({
    banner2Platform: "lazada",
    shopeeUrl: SHOPEE_URL,
  }, DEFAULT_SETTINGS), /Nền tảng banner 2 không hợp lệ/);

  assert.throws(() => validateSettingsInput({
    banner2Platform: "shopee",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: "https://evilshopee.vn/phish",
  }, DEFAULT_SETTINGS), /Shopee/);
});

test("a Shopee link is served untouched while a TikTok link still gets rewritten", async () => {
  const shopeeSettings = {
    ...DEFAULT_SETTINGS,
    promoEnabled: true,
    banner2Platform: "shopee",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: SHOPEE_URL,
  };
  const shopeeFollowUp = await followUpFor(shopeeSettings);
  assert.deepEqual(Object.keys(shopeeFollowUp).sort(), ["delayMs", "enabled", "imageUrl", "platform", "token"]);
  assert.equal(shopeeFollowUp.enabled, true);
  assert.equal(shopeeFollowUp.imageUrl, "/assets/shopee-09-09.webp");
  assert.equal(shopeeFollowUp.platform, "shopee");
  assert.ok(shopeeFollowUp.token, "banner 2 phải kèm lượt cấp để đổi lấy link");
  assert.equal(resolveBanner2Target(shopeeSettings), SHOPEE_URL);

  const tiktokSettings = {
    ...DEFAULT_SETTINGS,
    promoEnabled: true,
    banner2Platform: "tiktok",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: "https://shop.tiktok.com/vn/pdp/1736162251526342591",
  };
  const tiktokFollowUp = await followUpFor(tiktokSettings);
  assert.equal(tiktokFollowUp.platform, "tiktok");
  assert.equal(resolveBanner2Target(tiktokSettings), TIKTOK_URL);

  await saveSettings(DEFAULT_SETTINGS);
});

test("a Shopee link stored while the platform says TikTok never reaches visitors", async () => {
  const followUp = await followUpFor({
    ...DEFAULT_SETTINGS,
    promoEnabled: true,
    banner2Platform: "tiktok",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: SHOPEE_URL,
  });
  assert.equal(followUp.enabled, false);
  assert.equal(followUp.token, "");
  await saveSettings(DEFAULT_SETTINGS);
});

test("a Shopee banner 2 stays hidden on desktop just like the TikTok one", async () => {
  const shopeeSettings = {
    ...DEFAULT_SETTINGS,
    promoEnabled: true,
    banner2Platform: "shopee",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: SHOPEE_URL,
  };

  const onPhone = await promoFor(shopeeSettings, ANDROID);
  assert.equal(onPhone.enabled, true);
  assert.equal(onPhone.followUp.enabled, true);

  const onDesktop = await promoFor(shopeeSettings, MACBOOK);
  assert.equal(onDesktop.enabled, false);
  assert.equal(onDesktop.followUp.enabled, false, "banner 2 cũng phải tắt trên máy tính");
  assert.equal(onDesktop.followUp.token, "", "máy tính không được nhận lượt cấp nào");

  await saveSettings(DEFAULT_SETTINGS);
});

test("the admin form exposes the platform picker", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(html, /id="setting-banner2-platform"/);
  assert.match(html, /<option value="shopee">Shopee<\/option>/);
  assert.match(html, /<option value="tiktok">TikTok<\/option>/);
  assert.match(script, /banner2Platform/);
});
