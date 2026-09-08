const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_SESSION_SECRET = "promo-target-secret-that-is-long-enough";

const promoHandler = require("../lib/api-content/promo");
const promoTargetHandler = require("../lib/api-content/promo-target");
const { DEFAULT_SETTINGS, saveSettings } = require("../lib/content-store");
const { inspectDeviceSignals } = require("../lib/device-signals");
const { TOKEN_TTL_MS, createPromoToken, verifyPromoToken } = require("../lib/promo-token");

const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MACBOOK = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SHOPEE_URL = "https://shopee.vn/product/123456/7890123?utm_source=an_17370400296";
const PHONE_GPU = "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)";
const LAPTOP_GPU = "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)";

const SHOPEE_SETTINGS = {
  ...DEFAULT_SETTINGS,
  promoEnabled: true,
  banner2Platform: "shopee",
  shopeeEnabled: true,
  shopeeImageUrl: "/assets/shopee-09-09.webp",
  shopeeUrl: SHOPEE_URL,
};

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(value = "") { this.body += value; },
  };
}

async function mintToken(userAgent = ANDROID) {
  const res = response();
  await promoHandler({ method: "GET", query: { campaign: "default" }, headers: { "user-agent": userAgent } }, res);
  return JSON.parse(res.body).data.followUp.token;
}

async function exchange({ token, signals, userAgent = ANDROID }) {
  const res = response();
  await promoTargetHandler({
    method: "POST",
    headers: { "user-agent": userAgent, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: { token, signals },
    socket: {},
  }, res);
  return { statusCode: res.statusCode, payload: JSON.parse(res.body) };
}

test("a real phone exchanges its token for the affiliate link", async () => {
  await saveSettings(SHOPEE_SETTINGS);
  const token = await mintToken();
  assert.ok(token);

  const { statusCode, payload } = await exchange({ token, signals: { renderer: PHONE_GPU, touchRadius: 18 } });
  assert.equal(statusCode, 200);
  assert.equal(payload.data.targetUrl, SHOPEE_URL);

  await saveSettings(DEFAULT_SETTINGS);
});

test("a desktop faking a phone user agent is turned away by its GPU", async () => {
  await saveSettings(SHOPEE_SETTINGS);
  const token = await mintToken();

  // Responsive mode giả được user agent nhưng vẫn báo GPU máy tính.
  const emulated = await exchange({ token, signals: { renderer: LAPTOP_GPU, touchRadius: 0.5 } });
  assert.equal(emulated.statusCode, 404);
  assert.equal(emulated.payload.data, undefined);

  // Chạm dựng bởi DevTools có bán kính gần bằng 0 dù GPU bị giấu.
  const syntheticTouch = await exchange({ token, signals: { renderer: "", touchRadius: 0.5 } });
  assert.equal(syntheticTouch.statusCode, 404);

  await saveSettings(DEFAULT_SETTINGS);
});

test("the token is useless without a mobile user agent or a valid signature", async () => {
  await saveSettings(SHOPEE_SETTINGS);
  const token = await mintToken();
  const signals = { renderer: PHONE_GPU, touchRadius: 18 };

  assert.equal((await exchange({ token, signals, userAgent: MACBOOK })).statusCode, 404);
  assert.equal((await exchange({ token: `${token}x`, signals })).statusCode, 404);
  assert.equal((await exchange({ token: "", signals })).statusCode, 404);
  assert.equal((await exchange({ token: createPromoToken({ banner: "banner1", campaignId: "default" }), signals })).statusCode, 404);

  await saveSettings(DEFAULT_SETTINGS);
});

test("changing the affiliate link takes effect on the very next exchange", async () => {
  await saveSettings(SHOPEE_SETTINGS);
  const token = await mintToken();
  const signals = { renderer: PHONE_GPU, touchRadius: 18 };
  assert.equal((await exchange({ token, signals })).payload.data.targetUrl, SHOPEE_URL);

  const rotated = "https://shopee.vn/product/123456/7890123?utm_source=an_99999999999";
  await saveSettings({ ...SHOPEE_SETTINGS, shopeeUrl: rotated });
  // Lượt cấp cũ vẫn dùng được và phải trả về link affiliate mới.
  assert.equal((await exchange({ token, signals })).payload.data.targetUrl, rotated);

  await saveSettings(DEFAULT_SETTINGS);
});

test("the public settings endpoint never carries the affiliate link", async () => {
  await saveSettings(SHOPEE_SETTINGS);
  const res = response();
  await require("../lib/api-content/settings")({ method: "GET", headers: {} }, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(body.data).sort(), ["fanpageUrl", "logoUrl", "siteDescription", "siteTitle"]);
  assert.doesNotMatch(res.body, /an_17370400296|shopee/i, "cấu hình công khai không được lộ link affiliate");

  await saveSettings(DEFAULT_SETTINGS);
});

test("a token stops working once it expires", () => {
  const now = Date.now();
  const token = createPromoToken({ banner: "banner2", campaignId: "default" }, undefined, now);
  assert.deepEqual(verifyPromoToken(token, undefined, now + TOKEN_TTL_MS - 1000), { banner: "banner2", campaignId: "default" });
  assert.equal(verifyPromoToken(token, undefined, now + TOKEN_TTL_MS + 1000), null);
});

test("GPU names separate real phones from desktops, and stay permissive when unknown", () => {
  for (const renderer of [PHONE_GPU, "Mali-G710", "Apple A16 GPU", "PowerVR Rogue"]) {
    assert.equal(inspectDeviceSignals({ renderer }).trusted, true, `phải cho qua: ${renderer}`);
  }
  for (const renderer of [LAPTOP_GPU, "ANGLE (Intel, Intel(R) UHD Graphics 620, D3D11)", "ANGLE (Apple, Apple M2, OpenGL 4.1)", "ANGLE (AMD, AMD Radeon Pro 5500M, OpenGL 4.1)", "SwiftShader"]) {
    assert.equal(inspectDeviceSignals({ renderer }).trusted, false, `phải chặn: ${renderer}`);
  }
  // Trình duyệt giấu GPU thì không được chặn nhầm khách thật.
  assert.equal(inspectDeviceSignals({ renderer: "", touchRadius: 0 }).trusted, true);
  assert.equal(inspectDeviceSignals({ renderer: "Apple GPU" }).trusted, true);
  assert.equal(inspectDeviceSignals({}).trusted, true);
});
