const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.ADMIN_SESSION_SECRET = "affiliate-flow-secret-that-is-long-enough";

const promoHandler = require("../lib/api-content/promo");
const promoTargetHandler = require("../lib/api-content/promo-target");
const promoClickHandler = require("../lib/api-content/promo-click");
const { DEFAULT_SETTINGS, saveSettings } = require("../lib/content-store");
const { readPromoClicks } = require("../lib/promo-clicks");

const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PHONE_GPU = "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)";

// Link thật luôn mang tham số gắn hoa hồng; mất một ký tự là mất đơn.
const TIKTOK_AFFILIATE_URL = "https://www.tiktok.com/view/product/1736162251526342591?utm_source=copy&utm_campaign=client_share&share_app_id=1180";
const SHOPEE_AFFILIATE_URL = "https://shopee.vn/product/123456/7890123?utm_source=an_17370400296&utm_medium=affiliates&utm_campaign=id_abc123";

const LIVE_SETTINGS = {
  ...DEFAULT_SETTINGS,
  promoEnabled: true,
  promoImageUrl: "/assets/promo-10-10.webp",
  defaultTikTokUrl: TIKTOK_AFFILIATE_URL,
  banner2Platform: "shopee",
  shopeeEnabled: true,
  shopeeImageUrl: "/assets/shopee-09-09.webp",
  shopeeUrl: SHOPEE_AFFILIATE_URL,
};

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(value = "") { this.body += value; },
  };
}

// Chạy đúng những gì trình duyệt của khách làm khi mở bài rồi bấm cả hai banner.
async function visitAndTapBothBanners(userAgent) {
  const promoRes = response();
  await promoHandler({ method: "GET", query: { campaign: "default" }, headers: { "user-agent": userAgent } }, promoRes);
  const promo = JSON.parse(promoRes.body).data;

  const targetRes = response();
  await promoTargetHandler({
    method: "POST",
    headers: { "user-agent": userAgent, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: { token: promo.followUp.token, signals: { renderer: PHONE_GPU, touchRadius: 18 } },
    socket: {},
  }, targetRes);

  for (const banner of ["banner1", "banner2"]) {
    const clickRes = response();
    await promoClickHandler({
      method: "POST",
      headers: { "user-agent": userAgent, "x-forwarded-for": `10.0.1.${Math.floor(Math.random() * 250)}` },
      body: { banner },
      socket: {},
    }, clickRes);
    assert.equal(clickRes.statusCode, 200, `ghi nhận ${banner} phải thành công`);
  }

  return {
    banner1Url: promo.tiktokUrl,
    banner2Url: JSON.parse(targetRes.body).data?.targetUrl,
  };
}

test("both banners hand the phone the affiliate link with every tracking parameter intact", async () => {
  await saveSettings(LIVE_SETTINGS);

  for (const userAgent of [ANDROID, IPHONE]) {
    const { banner1Url, banner2Url } = await visitAndTapBothBanners(userAgent);

    assert.equal(banner1Url, TIKTOK_AFFILIATE_URL, "link TikTok phải giữ nguyên tham số gắn hoa hồng");
    assert.equal(banner2Url, SHOPEE_AFFILIATE_URL, "link Shopee phải giữ nguyên affiliate ID");

    // Soi từng tham số, phòng trường hợp chuẩn hoá URL đổi thứ tự hay bỏ sót.
    const shopeeParams = new URL(banner2Url).searchParams;
    assert.equal(shopeeParams.get("utm_source"), "an_17370400296");
    assert.equal(shopeeParams.get("utm_medium"), "affiliates");
    assert.equal(shopeeParams.get("utm_campaign"), "id_abc123");

    const tiktokParams = new URL(banner1Url).searchParams;
    assert.equal(tiktokParams.get("utm_source"), "copy");
    assert.equal(tiktokParams.get("share_app_id"), "1180");
  }

  await saveSettings(DEFAULT_SETTINGS);
});

test("a warm settings cache serves the same affiliate link, not a mangled one", async () => {
  await saveSettings(LIVE_SETTINGS);

  // Lượt đầu làm nóng bộ nhớ tạm, chín lượt sau đọc từ đó ra.
  for (let visit = 0; visit < 10; visit += 1) {
    const { banner1Url, banner2Url } = await visitAndTapBothBanners(ANDROID);
    assert.equal(banner1Url, TIKTOK_AFFILIATE_URL, `lượt ${visit + 1} lệch link TikTok`);
    assert.equal(banner2Url, SHOPEE_AFFILIATE_URL, `lượt ${visit + 1} lệch link Shopee`);
  }

  await saveSettings(DEFAULT_SETTINGS);
});

test("every tap on either banner is counted", async () => {
  await saveSettings(LIVE_SETTINGS);
  const before = (await readPromoClicks({ days: 1 })).totals;

  await visitAndTapBothBanners(ANDROID);
  await visitAndTapBothBanners(IPHONE);

  const after = (await readPromoClicks({ days: 1 })).totals;
  assert.equal(after.banner1 - before.banner1, 2);
  assert.equal(after.banner2 - before.banner2, 2);

  await saveSettings(DEFAULT_SETTINGS);
});

test("the connection to each shop is warmed up before the banner can be tapped", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "post.js"), "utf8");

  assert.match(script, /rel = rel/);
  assert.match(script, /"dns-prefetch", "preconnect"/);
  assert.match(script, /shopee: "https:\/\/shopee\.vn"/);

  // Phải bắt tay ngay khi biết banner sắp hiện, không đợi tới lúc chạm mới làm.
  const setup = script.slice(script.indexOf("async function setupPromo"));
  assert.ok(
    setup.indexOf("warmUpOrigin(promo.tiktokUrl)") < setup.indexOf("const showOffer")
      || setup.indexOf("warmUpOrigin(promo.tiktokUrl)") < setup.indexOf("await showOffer"),
    "việc bắt tay phải xảy ra trước khi banner hiện ra",
  );
});

test("the browser still navigates straight to the shop, with no redirect hop in between", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "post.js"), "utf8");

  // Chuyển hướng thẳng trong trình xử lý chạm là thứ giữ được việc bung app,
  // nơi cú bấm gắn vào tài khoản đang đăng nhập của người mua.
  assert.match(script, /location\.assign\(resolvedTarget\)/);
  assert.doesNotMatch(script, /window\.open|target="_blank"|rel="noreferrer"/);

  // Link phải sẵn sàng trước khi overlay hiện, để lúc chạm không phải chờ mạng.
  const showOffer = script.slice(script.indexOf("const showOffer"), script.indexOf("overlay.onclick = openTarget"));
  assert.match(showOffer, /await Promise\.all\(/);
  assert.ok(
    showOffer.indexOf("resolveTarget()") < showOffer.indexOf("overlay.hidden = false"),
    "link phải được giải xong trước khi banner hiện ra",
  );
});
