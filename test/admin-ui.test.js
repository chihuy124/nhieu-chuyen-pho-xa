const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("admin settings do not expose or submit an editable logo URL", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.doesNotMatch(html, /URL logo|setting-logo/);
  assert.doesNotMatch(script, /setting-logo|logoUrl\s*:/);
  assert.match(html, /setting-shopee-banner/);
  assert.match(html, /setting-shopee-url/);
  assert.match(html, /setting-shopee-enabled/);
  assert.match(html, /setting-promo-order/);
  assert.match(html, /shopee-first/);
  assert.match(html, /tiktok-first/);
  assert.match(script, /shopeeImageUrl/);
  assert.match(script, /shopeeUrl/);
  assert.match(script, /shopeeEnabled/);
  assert.match(script, /promoOrder/);
  assert.match(html, /setting-fanpage/);
  assert.match(script, /fanpageUrl/);
  assert.match(html, /admin\.js\?v=14/);
});

test("in-app escape script uses the configured external browser target", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "escape-in-app.js"), "utf8");
  assert.match(script, /external-browser-url/);
});

test("post row action menu can copy the full article permalink", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(script, /Sao chép link bài viết/);
  assert.match(script, /navigator\.clipboard/);
  assert.match(script, /post\.permalink/);
  assert.match(script, /aria-haspopup/);
  assert.match(html, /admin\.js\?v=14/);
});

test("crawl form defaults to one day and can switch to a date range", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(html, /value="single" checked/);
  assert.match(html, /id="crawl-date"/);
  assert.match(html, /id="crawl-single-fields"/);
  assert.match(html, /id="crawl-range-fields"[^>]*hidden/);
  assert.match(html, /value="range"/);
  assert.match(script, /crawlMode === "single" \? selectedDate/);
  assert.match(script, /singleFields\.hidden = crawlMode !== "single"/);
  assert.match(script, /rangeFields\.hidden = crawlMode !== "range"/);
  assert.match(script, /singleDate\.required = crawlMode === "single"/);
  assert.match(html, /id="crawl-source"/);
  assert.match(html, /value="https:\/\/nhieuchuyenduongpho\.com"/);
  assert.match(html, /value="https:\/\/honghotduong\.com"/);
  assert.match(html, /value="https:\/\/hongbienpro\.com"/);
  assert.match(html, />Hóng Biến Pro</);
  assert.match(script, /sourceOrigin/);
  assert.match(script, /document\.getElementById\("crawl-source"\)\.value/);
  assert.match(script, /fetchWordPressSource/);
  assert.match(script, /retry-after/);
  assert.match(script, /sourceResponse\.status >= 500/);
  assert.match(html, /admin\.js\?v=14/);
});

test("admin post library exposes a soft-delete trash workflow", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(html, /data-section="trash"/);
  assert.match(html, /data-panel="trash"/);
  assert.match(html, /id="trash-table"/);
  assert.match(html, />Thùng rác</);
  assert.match(script, /Chuyển vào thùng rác/);
  assert.match(script, /Khôi phục/);
  assert.match(script, /Xóa vĩnh viễn/);
  assert.match(script, /trash=1/);
  assert.match(script, /operation:\s*"restore"/);
  assert.match(script, /permanent=1/);
  assert.match(script, /confirm\("Xóa vĩnh viễn/);
});

test("admin post library filters by date and renders one block per day", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
  assert.match(html, /id="posts-date-filter"/);
  assert.match(html, /id="clear-posts-date"/);
  assert.match(html, /Lọc theo ngày/);
  assert.match(html, /date-groups/);
  assert.match(script, /post-date-group/);
  assert.match(script, /post-date-heading/);
  assert.match(script, /groupPostsByDate/);
  assert.match(script, /searchParams\.set\("date"/);
  assert.match(script, /posts-date-filter/);
  assert.match(html, /admin\.js\?v=14/);
});

test("article promo script respects configured order and schedules the second popup after returning", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "post.js"), "utf8");
  assert.match(script, /sequence:v3:[^`]*:shopee/);
  assert.match(script, /promo\.followUp/);
  assert.match(script, /setTimeout/);
  assert.match(script, /pageshow/);
  assert.match(script, /delayMs/);
  assert.match(script, /promo\.promoOrder/);
  assert.match(script, /orderedOffers/);
  assert.match(script, /sequence:v3/);
  assert.match(script, /image\.decode/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /params\.get\("promo"\) \|\| "default"/);
  assert.doesNotMatch(script, /if \(!campaignId\) return/);
  assert.match(script, /performance\.getEntriesByType/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /back_forward/);
  assert.match(script, /reload/);
  assert.match(script, /pageViewId/);
});

test("dynamic article renderer appends the configured fanpage call to action", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "assets", "post.js"), "utf8");
  assert.match(script, /FANPAGE:/);
  assert.match(script, /THEO DÕI TẠI ĐÂY/);
  assert.match(script, /settings\.fanpageUrl/);
});
