const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const recordHandler = require("../lib/api-content/promo-click");
const statsHandler = require("../lib/api-admin/promo-clicks");
const { createSessionToken } = require("../lib/auth");
const { createMemoryKv } = require("../lib/kv");
const {
  clickKey,
  normalizeBanner,
  readPromoClicks,
  recentDateKeys,
  recordPromoClick,
  vietnamDateKey,
} = require("../lib/promo-clicks");

function response() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
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
      "x-forwarded-for": options.ip || "10.0.0.7",
      host: "example.test",
      origin: "https://example.test",
      "x-forwarded-proto": "https",
    },
  };
}

function parsed(res) {
  return JSON.parse(res.body);
}

test("click counters are stored per banner and per Vietnam day", async () => {
  const client = createMemoryKv();
  const noon = Date.parse("2026-08-29T05:00:00Z");
  await recordPromoClick("banner1", client, noon);
  await recordPromoClick("banner1", client, noon);
  await recordPromoClick("banner2", client, noon);

  assert.equal(await client.get(clickKey("banner1", "2026-08-29")), 2);
  assert.equal(await client.get(clickKey("banner2", "2026-08-29")), 1);

  const previousEvening = Date.parse("2026-08-28T16:30:00Z");
  const recorded = await recordPromoClick("banner1", client, previousEvening);
  assert.deepEqual(recorded, { banner: "banner1", date: "2026-08-28", clicks: 1 });
});

test("a click just before Vietnam midnight belongs to the day that is ending", async () => {
  const client = createMemoryKv();
  await recordPromoClick("banner1", client, Date.parse("2026-08-29T16:59:00Z"));
  await recordPromoClick("banner1", client, Date.parse("2026-08-29T17:01:00Z"));
  assert.equal(vietnamDateKey(Date.parse("2026-08-29T16:59:00Z")), "2026-08-29");
  assert.equal(await client.get(clickKey("banner1", "2026-08-29")), 1);
  assert.equal(await client.get(clickKey("banner1", "2026-08-30")), 1);
});

test("unknown banners are rejected before touching storage", async () => {
  const client = createMemoryKv();
  assert.equal(normalizeBanner(" Banner1 "), "banner1");
  assert.equal(normalizeBanner("tiktok"), "");
  assert.equal(normalizeBanner("shopee"), "");
  assert.equal(normalizeBanner("banner-3"), "");
  await assert.rejects(() => recordPromoClick("banner-3", client), /Banner không hợp lệ/);
});

test("stats return one row per day plus range totals", async () => {
  const client = createMemoryKv();
  const now = Date.parse("2026-08-29T05:00:00Z");
  await recordPromoClick("banner1", client, now);
  await recordPromoClick("banner1", client, now);
  await recordPromoClick("banner2", client, now);
  await recordPromoClick("banner2", client, Date.parse("2026-08-27T05:00:00Z"));

  const stats = await readPromoClicks({ days: 3 }, client, now);
  assert.deepEqual(stats.days, [
    { date: "2026-08-29", banner1: 2, banner2: 1, total: 3 },
    { date: "2026-08-28", banner1: 0, banner2: 0, total: 0 },
    { date: "2026-08-27", banner1: 0, banner2: 1, total: 1 },
  ]);
  assert.deepEqual(stats.totals, { banner1: 2, banner2: 2, total: 4 });

  const singleDay = await readPromoClicks({ date: "2026-08-27" }, client, now);
  assert.deepEqual(singleDay.days, [{ date: "2026-08-27", banner1: 0, banner2: 1, total: 1 }]);
  assert.deepEqual(singleDay.totals, { banner1: 0, banner2: 1, total: 1 });
});

test("stats ranges are clamped and invalid days are rejected", async () => {
  const client = createMemoryKv();
  const now = Date.parse("2026-03-05T05:00:00Z");
  assert.equal(recentDateKeys(0, now).length, 1);
  assert.equal(recentDateKeys(500, now).length, 90);
  assert.deepEqual(recentDateKeys(3, Date.parse("2026-03-01T05:00:00Z")), ["2026-03-01", "2026-02-28", "2026-02-27"]);
  await assert.rejects(() => readPromoClicks({ date: "2026-02-30" }, client, now), /Ngày thống kê không hợp lệ/);
});

test("public endpoint records a click and refuses other methods", async () => {
  const getRes = response();
  await recordHandler(req("GET"), getRes);
  assert.equal(getRes.statusCode, 405);

  const badRes = response();
  await recordHandler(req("POST", { body: { banner: "banner-3" } }), badRes);
  assert.equal(badRes.statusCode, 400);

  const okRes = response();
  await recordHandler(req("POST", { body: { banner: "banner2" } }), okRes);
  assert.equal(okRes.statusCode, 200);
  assert.equal(parsed(okRes).data.banner, "banner2");
  assert.equal(parsed(okRes).data.date, vietnamDateKey());
});

test("stats endpoint requires an admin session", async () => {
  process.env.ADMIN_PASSWORD = ["clicks", "password"].join("-");
  process.env.ADMIN_SESSION_SECRET = "clicks-secret-that-is-long-enough";

  const anonymousRes = response();
  await statsHandler(req("GET", { query: { days: "7" } }), anonymousRes);
  assert.equal(anonymousRes.statusCode, 401);

  const adminRes = response();
  await statsHandler(req("GET", {
    query: { days: "7" },
    cookie: `admin_session=${createSessionToken(process.env.ADMIN_SESSION_SECRET)}`,
  }), adminRes);
  assert.equal(adminRes.statusCode, 200);
  assert.equal(parsed(adminRes).data.days.length, 7);

  const invalidRes = response();
  await statsHandler(req("GET", {
    query: { date: "khong-phai-ngay" },
    cookie: `admin_session=${createSessionToken(process.env.ADMIN_SESSION_SECRET)}`,
  }), invalidRes);
  assert.equal(invalidRes.statusCode, 422);
});

test("the promo popup reports which banner was clicked before redirecting", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "post.js"), "utf8");
  assert.match(script, /\/api\/content\/promo-click/);
  assert.match(script, /navigator\.sendBeacon/);
  assert.match(script, /keepalive: true/);
  assert.match(script, /banner: "banner1"/);
  assert.match(script, /banner: "banner2"/);
  assert.match(script, /reportPromoClick\(banner\);\n\s+hideOffer\(\);/);
});

test("admin exposes a daily click report for both banners", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(html, /data-section="clicks"/);
  assert.match(html, /data-panel="clicks"/);
  assert.match(html, /id="clicks-table"/);
  assert.match(html, /id="clicks-range"/);
  assert.match(html, /id="clicks-date"/);
  assert.match(html, /metric-clicks-banner1/);
  assert.match(html, /metric-clicks-banner2/);
  assert.match(script, /\/api\/admin\/promo-clicks/);
  assert.match(script, /loadPromoClicks/);
});
