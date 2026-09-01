const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveSettingsLinks, resolveTikTokLink } = require("../lib/tiktok-link");

function fakeFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url);
    const location = routes[url];
    if (location instanceof Error) throw location;
    return { headers: { get: (name) => (name.toLowerCase() === "location" ? location || null : null) } };
  };
}

test("short links are followed once and rewritten to the view page", async () => {
  const calls = [];
  const fetchImpl = fakeFetch({
    "https://vt.tiktok.com/ZS9Short/": "https://shop.tiktok.com/vn/pdp/1736162251526342591?scene=pdp",
  }, calls);
  assert.equal(
    await resolveTikTokLink("https://vt.tiktok.com/ZS9Short/", { fetchImpl }),
    "https://www.tiktok.com/view/product/1736162251526342591?scene=pdp",
  );
  assert.deepEqual(calls, ["https://vt.tiktok.com/ZS9Short/"]);
});

test("a short link that already points at the view page keeps its destination", async () => {
  const target = "https://www.tiktok.com/view/product/1729438480898231207?utm_source=copy";
  const fetchImpl = fakeFetch({ "https://vm.tiktok.com/AbCd12/": target });
  assert.equal(await resolveTikTokLink("https://vm.tiktok.com/AbCd12/", { fetchImpl }), target);
});

test("chained short links are followed up to the hop limit", async () => {
  const fetchImpl = fakeFetch({
    "https://vt.tiktok.com/one/": "https://vm.tiktok.com/two/",
    "https://vm.tiktok.com/two/": "https://shop.tiktok.com/vn/pdp/1729438480898231207",
  });
  assert.equal(
    await resolveTikTokLink("https://vt.tiktok.com/one/", { fetchImpl }),
    "https://www.tiktok.com/view/product/1729438480898231207",
  );

  const looping = fakeFetch({
    "https://vt.tiktok.com/loop/": "https://vm.tiktok.com/loop/",
    "https://vm.tiktok.com/loop/": "https://vt.tiktok.com/loop/",
  });
  assert.equal(await resolveTikTokLink("https://vt.tiktok.com/loop/", { fetchImpl: looping }), "https://vt.tiktok.com/loop/");
});

test("the original link survives a network failure, a missing header or a hostile redirect", async () => {
  const failing = fakeFetch({ "https://vt.tiktok.com/down/": new Error("network down") });
  assert.equal(await resolveTikTokLink("https://vt.tiktok.com/down/", { fetchImpl: failing }), "https://vt.tiktok.com/down/");

  const noHeader = fakeFetch({});
  assert.equal(await resolveTikTokLink("https://vt.tiktok.com/plain/", { fetchImpl: noHeader }), "https://vt.tiktok.com/plain/");

  const hostile = fakeFetch({ "https://vt.tiktok.com/evil/": "https://evil.example/phish" });
  assert.equal(await resolveTikTokLink("https://vt.tiktok.com/evil/", { fetchImpl: hostile }), "https://vt.tiktok.com/evil/");
});

test("an expired short link that lands on a non-product page keeps the original link", async () => {
  const expired = fakeFetch({ "https://vt.tiktok.com/hethan/": "https://www.tiktok.com/?_r=1" });
  assert.equal(await resolveTikTokLink("https://vt.tiktok.com/hethan/", { fetchImpl: expired }), "https://vt.tiktok.com/hethan/");

  const video = fakeFetch({ "https://vt.tiktok.com/video/": "https://www.tiktok.com/@nguoidung/video/7123456789" });
  assert.equal(await resolveTikTokLink("https://vt.tiktok.com/video/", { fetchImpl: video }), "https://vt.tiktok.com/video/");
});

test("links that need no lookup never touch the network", async () => {
  const calls = [];
  const fetchImpl = fakeFetch({}, calls);
  assert.equal(
    await resolveTikTokLink("https://shop.tiktok.com/vn/pdp/1736162251526342591", { fetchImpl }),
    "https://www.tiktok.com/view/product/1736162251526342591",
  );
  assert.equal(await resolveTikTokLink("https://www.tiktok.com/@nguoidung/video/123", { fetchImpl }), "https://www.tiktok.com/@nguoidung/video/123");
  assert.equal(await resolveTikTokLink("https://evil.example/vn/pdp/123", { fetchImpl }), "https://evil.example/vn/pdp/123");
  assert.equal(await resolveTikTokLink("", { fetchImpl }), "");
  assert.deepEqual(calls, []);
});

test("saving settings resolves both banner links and leaves the rest of the payload alone", async () => {
  const fetchImpl = fakeFetch({
    "https://vt.tiktok.com/banner1/": "https://shop.tiktok.com/vn/pdp/1736162251526342591",
    "https://vt.tiktok.com/banner2/": "https://shop.tiktok.com/vn/pdp/1729438480898231207",
  });
  const resolved = await resolveSettingsLinks({
    siteTitle: "Nhiều Chuyện Đường Phố",
    defaultTikTokUrl: "https://vt.tiktok.com/banner1/",
    shopeeUrl: "https://vt.tiktok.com/banner2/",
    promoOrder: "shopee-first",
  }, { fetchImpl });
  assert.equal(resolved.defaultTikTokUrl, "https://www.tiktok.com/view/product/1736162251526342591");
  assert.equal(resolved.shopeeUrl, "https://www.tiktok.com/view/product/1729438480898231207");
  assert.equal(resolved.siteTitle, "Nhiều Chuyện Đường Phố");
  assert.equal(resolved.promoOrder, "shopee-first");
});

test("an empty or absent banner link is left untouched so it can still be cleared", async () => {
  const calls = [];
  const fetchImpl = fakeFetch({}, calls);
  const resolved = await resolveSettingsLinks({ shopeeUrl: "", shopeeEnabled: false }, { fetchImpl });
  assert.equal(resolved.shopeeUrl, "");
  assert.equal("defaultTikTokUrl" in resolved, false);
  assert.deepEqual(calls, []);
});
