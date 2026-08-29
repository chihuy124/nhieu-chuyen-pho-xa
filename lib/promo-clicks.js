const { getKv } = require("./kv");
const kv = getKv();

const BANNERS = Object.freeze(["banner1", "banner2"]);
const CLICK_TTL_SECONDS = 400 * 24 * 60 * 60;
const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 14;
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const vietnamDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: VIETNAM_TIME_ZONE,
});

function vietnamDateKey(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Thời điểm không hợp lệ");
  const parts = Object.fromEntries(vietnamDateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function assertDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("Ngày thống kê không hợp lệ");
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) throw new Error("Ngày thống kê không hợp lệ");
  return match[0];
}

function shiftDateKey(dateKey, deltaDays) {
  const [year, month, day] = assertDateKey(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + deltaDays)).toISOString().slice(0, 10);
}

function normalizeBanner(value) {
  const banner = String(value || "").trim().toLowerCase();
  return BANNERS.includes(banner) ? banner : "";
}

function clickKey(banner, dateKey) {
  return `promo:clicks:${banner}:${dateKey}`;
}

function recentDateKeys(days = DEFAULT_RANGE_DAYS, now = Date.now()) {
  const requestedDays = Math.floor(Number(days));
  const safeDays = Number.isFinite(requestedDays)
    ? Math.min(MAX_RANGE_DAYS, Math.max(1, requestedDays))
    : DEFAULT_RANGE_DAYS;
  const today = vietnamDateKey(now);
  return Array.from({ length: safeDays }, (_value, index) => shiftDateKey(today, -index));
}

async function recordPromoClick(banner, client = kv, now = Date.now()) {
  const safeBanner = normalizeBanner(banner);
  if (!safeBanner) throw new Error("Banner không hợp lệ");
  const dateKey = vietnamDateKey(now);
  const key = clickKey(safeBanner, dateKey);
  const clicks = await client.incr(key);
  if (clicks === 1) await client.expire(key, CLICK_TTL_SECONDS);
  return { banner: safeBanner, date: dateKey, clicks };
}

async function readPromoClicks({ days = DEFAULT_RANGE_DAYS, date = "" } = {}, client = kv, now = Date.now()) {
  const dateKeys = date ? [assertDateKey(date)] : recentDateKeys(days, now);
  const keys = dateKeys.flatMap((dateKey) => BANNERS.map((banner) => clickKey(banner, dateKey)));
  const stored = await client.mget(...keys);
  const rows = dateKeys.map((dateKey, dayIndex) => {
    const counts = Object.fromEntries(BANNERS.map((banner, bannerIndex) => [
      banner,
      Math.max(0, Number(stored[dayIndex * BANNERS.length + bannerIndex]) || 0),
    ]));
    return { date: dateKey, ...counts, total: BANNERS.reduce((sum, banner) => sum + counts[banner], 0) };
  });
  const totals = Object.fromEntries(BANNERS.map((banner) => [
    banner,
    rows.reduce((sum, row) => sum + row[banner], 0),
  ]));
  totals.total = BANNERS.reduce((sum, banner) => sum + totals[banner], 0);
  return { days: rows, totals };
}

module.exports = {
  BANNERS,
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  clickKey,
  normalizeBanner,
  readPromoClicks,
  recentDateKeys,
  recordPromoClick,
  vietnamDateKey,
};
