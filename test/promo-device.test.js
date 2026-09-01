const test = require("node:test");
const assert = require("node:assert/strict");

const promoHandler = require("../lib/api-content/promo");
const { DEFAULT_SETTINGS, saveSettings } = require("../lib/content-store");
const { isMobileUserAgent } = require("../lib/user-agent");

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MACBOOK = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(value = "") { this.body += value; },
  };
}

function req(userAgent) {
  return { method: "GET", query: { campaign: "default" }, headers: { "user-agent": userAgent } };
}

async function promoFor(userAgent) {
  const res = response();
  await promoHandler(req(userAgent), res);
  return JSON.parse(res.body).data;
}

test("mobile detection accepts phones and rejects desktops", () => {
  assert.equal(isMobileUserAgent(IPHONE), true);
  assert.equal(isMobileUserAgent(ANDROID), true);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14) FB_IAB/FB4A Mobile"), true);
  assert.equal(isMobileUserAgent(MACBOOK), false);
  assert.equal(isMobileUserAgent(WINDOWS), false);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0"), false);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 iPhone"), false);
  assert.equal(isMobileUserAgent(""), false);
  assert.equal(isMobileUserAgent(undefined), false);
});

test("the popup sequence only turns on for mobile visitors", async () => {
  await saveSettings({
    ...DEFAULT_SETTINGS,
    promoEnabled: true,
    defaultTikTokUrl: "https://www.tiktok.com/view/product/1736162251526342591",
    shopeeEnabled: true,
    shopeeImageUrl: "/assets/shopee-09-09.webp",
    shopeeUrl: "https://www.tiktok.com/view/product/1729438480898231207",
  });

  const onPhone = await promoFor(ANDROID);
  assert.equal(onPhone.enabled, true);
  assert.equal(onPhone.followUp.enabled, true);

  for (const desktop of [MACBOOK, WINDOWS, ""]) {
    const onDesktop = await promoFor(desktop);
    assert.equal(onDesktop.enabled, false, `phải tắt cho: ${desktop || "(không có user agent)"}`);
  }

  await saveSettings(DEFAULT_SETTINGS);
});

test("a disabled campaign stays disabled even on mobile", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, promoEnabled: false });
  assert.equal((await promoFor(IPHONE)).enabled, false);
  await saveSettings(DEFAULT_SETTINGS);
});
