const test = require("node:test");
const assert = require("node:assert/strict");

const { getKv } = require("../lib/kv");
const {
  DEFAULT_SETTINGS,
  SETTINGS_CACHE_TTL_MS,
  clearSettingsCache,
  getFreshSettings,
  getSettings,
  saveSettings,
} = require("../lib/content-store");

const kv = getKv();

// Đếm số lần thật sự chạm Redis, vì đây mới là thứ tính vào hạn mức Upstash.
test("the three reads of one page view collapse onto a single Redis command", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, siteTitle: "Bản gốc" });
  clearSettingsCache();

  const original = kv.get;
  let reads = 0;
  kv.get = async (...args) => { reads += 1; return original.apply(kv, args); };
  try {
    const [first] = await Promise.all([getSettings(), getSettings(), getSettings()]);
    await getSettings();
    assert.equal(reads, 1, "ba request song song cộng một lượt sau chỉ được bắn một lệnh");
    assert.equal(first.siteTitle, "Bản gốc");
  } finally {
    kv.get = original;
  }

  await saveSettings(DEFAULT_SETTINGS);
});

test("saving settings makes the new value visible immediately, without a stale window", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, siteTitle: "Trước khi đổi" });
  assert.equal((await getSettings()).siteTitle, "Trước khi đổi");

  // Đổi affiliate ID trong admin phải ăn ngay trên chính instance vừa lưu.
  await saveSettings({ ...DEFAULT_SETTINGS, siteTitle: "Sau khi đổi", shopeeUrl: "https://shopee.vn/a/b?utm_source=an_moi" });
  const afterSave = await getSettings();
  assert.equal(afterSave.siteTitle, "Sau khi đổi");
  assert.equal(afterSave.shopeeUrl, "https://shopee.vn/a/b?utm_source=an_moi");

  await saveSettings(DEFAULT_SETTINGS);
});

test("the cache expires so other instances pick a change up on their own", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, siteTitle: "Giá trị cũ" });
  assert.equal((await getSettings()).siteTitle, "Giá trị cũ");

  // Ghi thẳng xuống Redis, mô phỏng một instance khác vừa lưu cấu hình mới.
  await kv.set("content:site-settings", { ...DEFAULT_SETTINGS, siteTitle: "Giá trị mới" });
  assert.equal((await getSettings()).siteTitle, "Giá trị cũ", "trong TTL vẫn dùng bản đang giữ");

  const realNow = Date.now;
  Date.now = () => realNow() + SETTINGS_CACHE_TTL_MS + 1;
  try {
    assert.equal((await getSettings()).siteTitle, "Giá trị mới", "hết TTL là đọc lại");
  } finally {
    Date.now = realNow;
  }

  await saveSettings(DEFAULT_SETTINGS);
});

test("a caller passing its own client never touches the shared cache", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, siteTitle: "Bộ nhớ chung" });
  await getSettings();

  const isolated = require("../lib/kv").createMemoryKv();
  await isolated.set("content:site-settings", { ...DEFAULT_SETTINGS, siteTitle: "Riêng" });
  assert.equal((await getSettings(isolated)).siteTitle, "Riêng");
  assert.equal((await getSettings()).siteTitle, "Bộ nhớ chung", "client riêng không được ghi đè bộ nhớ chung");

  await saveSettings(DEFAULT_SETTINGS);
});

test("the admin always reads the newest settings so a save never writes a stale value back", async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, siteTitle: "Giá trị cũ" });
  assert.equal((await getSettings()).siteTitle, "Giá trị cũ");

  // Một instance khác vừa đổi link affiliate; màn admin phải thấy bản mới ngay,
  // nếu không thì giá trị cũ sẽ bị merge đè xuống Redis lúc bấm lưu.
  await kv.set("content:site-settings", { ...DEFAULT_SETTINGS, siteTitle: "Vừa đổi", shopeeUrl: "https://shopee.vn/a/b?utm_source=an_moi" });
  assert.equal((await getSettings()).siteTitle, "Giá trị cũ", "luồng công khai vẫn dùng bản đang giữ");

  const fresh = await getFreshSettings();
  assert.equal(fresh.siteTitle, "Vừa đổi");
  assert.equal(fresh.shopeeUrl, "https://shopee.vn/a/b?utm_source=an_moi");

  await saveSettings(DEFAULT_SETTINGS);
});

test("a failed read is not cached and does not wedge later reads", async () => {
  clearSettingsCache();
  const original = kv.get;
  kv.get = async () => { throw new Error("Redis hết hạn mức"); };
  try {
    await assert.rejects(getSettings(), /Redis hết hạn mức/);
  } finally {
    kv.get = original;
  }

  // Lỗi trước đó không được giữ lại, lượt sau phải đọc được bình thường.
  assert.equal((await getSettings()).siteTitle, DEFAULT_SETTINGS.siteTitle);
});
