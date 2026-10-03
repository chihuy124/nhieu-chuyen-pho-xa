const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveShopeeAppLink } = require("../lib/shopee-link");

const SHORT_LINK = "https://s.shopee.vn/80CJxemL1I";
const AFFILIATE_QUERY = "__mobile__=1&credential_token=tuoi-moi-lan&mmp_pid=an_17370400296&uls_trackid=xyz789"
  + "&utm_campaign=id_abc&utm_medium=affiliates&utm_source=an_17370400296&utm_term=qwerty";
const REDIRECT_TARGET = `https://shopee.vn/opaanlp/703090265/28933336937?${AFFILIATE_QUERY}`;

function redirectingFetch(location, { status = 301 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { status, headers: { get: (name) => (name.toLowerCase() === "location" ? location : null) } };
  };
  return { fetchImpl, calls };
}

test("a short link is resolved to the path the Shopee app understands", async () => {
  const { fetchImpl, calls } = redirectingFetch(REDIRECT_TARGET);
  const resolved = await resolveShopeeAppLink(SHORT_LINK, { fetchImpl });

  const url = new URL(resolved);
  assert.equal(url.pathname, "/product/703090265/28933336937", "app không mở được /opaanlp/");
  assert.equal(url.hostname, "shopee.vn");

  // Đổi đúng một thứ là đường dẫn; mọi tham số gắn hoa hồng phải còn nguyên.
  assert.equal(url.searchParams.get("utm_source"), "an_17370400296");
  assert.equal(url.searchParams.get("mmp_pid"), "an_17370400296");
  assert.equal(url.searchParams.get("utm_medium"), "affiliates");
  assert.equal(url.searchParams.get("credential_token"), "tuoi-moi-lan");
  assert.equal(url.searchParams.get("uls_trackid"), "xyz789");
  assert.equal(new URL(REDIRECT_TARGET).search, url.search, "chuỗi tham số phải giữ nguyên từng ký tự");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, "manual");
  // UA máy tính mới nhận được 301 sạch; UA di động trả về trang HTML trung gian.
  assert.match(calls[0].options.headers["user-agent"], /Windows NT|Macintosh/);
});

test("both short link hosts are followed", async () => {
  for (const shortLink of ["https://s.shopee.vn/80CJxemL1I", "https://shope.ee/9ABCdefG"]) {
    const { fetchImpl, calls } = redirectingFetch(REDIRECT_TARGET);
    const resolved = await resolveShopeeAppLink(shortLink, { fetchImpl });
    assert.equal(new URL(resolved).pathname, "/product/703090265/28933336937", `chưa giải: ${shortLink}`);
    assert.equal(calls.length, 1);
  }
});

test("a link that is already app friendly is returned untouched, without a network call", async () => {
  const calls = [];
  const fetchImpl = async (...args) => { calls.push(args); throw new Error("không được gọi mạng"); };

  for (const link of [
    "https://shopee.vn/product/703090265/28933336937?utm_source=an_17370400296",
    "https://shopee.vn/ao-thun-tron-i.703090265.28933336937?utm_source=an_17370400296",
  ]) {
    assert.equal(await resolveShopeeAppLink(link, { fetchImpl }), link, "link thường phải giữ nguyên từng ký tự");
  }
  assert.equal(calls.length, 0, "link thường không được tốn thêm một lượt gọi mạng nào");
});

test("an /opaanlp/ link stored directly is rewritten without a network call", async () => {
  const fetchImpl = async () => { throw new Error("không được gọi mạng"); };
  const resolved = await resolveShopeeAppLink(REDIRECT_TARGET, { fetchImpl });
  assert.equal(new URL(resolved).pathname, "/product/703090265/28933336937");
});

test("any failure falls back to the original link so the banner never goes dark", async () => {
  const failures = {
    "mạng lỗi": async () => { throw new Error("ECONNRESET"); },
    "quá hạn chờ": async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); },
    "không có header location": async () => ({ status: 200, headers: { get: () => null } }),
    "location rác": async () => ({ status: 301, headers: { get: () => "::::" } }),
  };
  for (const [label, fetchImpl] of Object.entries(failures)) {
    assert.equal(await resolveShopeeAppLink(SHORT_LINK, { fetchImpl }), SHORT_LINK, `sai ở: ${label}`);
  }
});

test("a redirect that does not land on a product keeps the original link", async () => {
  // Link hết hạn thường đổ về trang chủ; giữ link gốc còn hơn đưa khách tới trang vô nghĩa.
  for (const target of [
    "https://shopee.vn/",
    "https://shopee.vn/::::",
    "https://shopee.vn/verify/traffic/error?type=4",
    "https://shopee.vn/opaanlp/khong-phai-so/28933336937",
  ]) {
    const { fetchImpl } = redirectingFetch(target);
    assert.equal(await resolveShopeeAppLink(SHORT_LINK, { fetchImpl }), SHORT_LINK, `phải giữ link gốc: ${target}`);
  }
});

test("a redirect that leaves Shopee is refused", async () => {
  // Link rút gọn bị chiếm quyền không được kéo người dùng sang nơi khác.
  for (const hostile of ["https://evil.example.com/phish", "https://shopee.vn.evil.com/phish", "http://shopee.vn/product/1/2"]) {
    const { fetchImpl } = redirectingFetch(hostile);
    assert.equal(await resolveShopeeAppLink(SHORT_LINK, { fetchImpl }), SHORT_LINK, `phải từ chối: ${hostile}`);
  }
});

test("input that is not a Shopee link is left alone", async () => {
  const fetchImpl = async () => { throw new Error("không được gọi mạng"); };
  for (const value of ["", "   ", "khong-phai-url", "https://www.tiktok.com/view/product/123"]) {
    assert.equal(await resolveShopeeAppLink(value, { fetchImpl }), value.trim());
  }
});
