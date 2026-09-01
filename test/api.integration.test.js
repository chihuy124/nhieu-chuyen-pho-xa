const test = require("node:test");
const assert = require("node:assert/strict");

const loginHandler = require("../lib/api-admin/login");
const crawlHandler = require("../lib/api-admin/crawl");
const postHandler = require("../lib/api-admin/post");
const postsHandler = require("../lib/api-admin/posts");
const publicPostHandler = require("../lib/api-content/post");
const publicPageHandler = require("../lib/api-content/page");
const promoHandler = require("../lib/api-content/promo");
const createShimHandler = require("../api/shim/create");
const profileHandler = require("../api/shim/profile");
const {
  DEFAULT_SETTINGS,
  deletePost,
  savePost,
  saveSettings,
} = require("../lib/content-store");

const MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value)); },
    end(value = "") { this.body += value; },
  };
}

function request(method, { body, cookie = "", query = {}, mutation = false, userAgent = "" } = {}) {
  return {
    method,
    body,
    query,
    headers: {
      cookie,
      "user-agent": userAgent,
      host: "example.test",
      origin: "https://example.test",
      "x-forwarded-proto": "https",
      ...(mutation ? { "x-admin-request": "1" } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function parsed(res) {
  return JSON.parse(res.body);
}

test("admin CRUD to public article and Facebook shim promo flow", async () => {
  const integrationPassword = ["integration", "password"].join("-");
  process.env.ADMIN_PASSWORD = integrationPassword;
  process.env.ADMIN_SESSION_SECRET = "integration-secret-that-is-long-enough";

  const loginRes = response();
  await loginHandler(request("POST", { body: { password: integrationPassword }, mutation: true }), loginRes);
  assert.equal(loginRes.statusCode, 200);
  const cookie = loginRes.headers["set-cookie"].split(";")[0];

  const slug = `integration-${Date.now()}`;
  const unauthorizedRes = response();
  await postsHandler(request("POST", { body: { title: "Nope" }, mutation: true }), unauthorizedRes);
  assert.equal(unauthorizedRes.statusCode, 401);

  const createRes = response();
  await postsHandler(request("POST", {
    cookie,
    mutation: true,
    body: {
      title: "Bài tích hợp",
      slug,
      excerpt: "Mô tả",
      contentHtml: "<p>Nội dung</p>",
      status: "published",
      publishedAt: "2026-08-09T10:00:00.000Z",
      tiktokUrl: "https://www.tiktok.com/@demo/video/123",
      videos: ["https://cdn.example.com/demo.mp4"],
    },
  }), createRes);
  assert.equal(createRes.statusCode, 201);

  const publicRes = response();
  await publicPostHandler(request("GET", { query: { slug } }), publicRes);
  assert.equal(publicRes.statusCode, 200);
  assert.equal(parsed(publicRes).data.title, "Bài tích hợp");
  assert.match(publicRes.headers["cache-control"], /^public/);

  const directFacebookRes = response();
  await publicPageHandler(request("GET", {
    query: { slug },
    userAgent: "Mozilla/5.0 (Linux; Android 15; wv) FB_IAB/FB4A",
  }), directFacebookRes);
  assert.equal(directFacebookRes.statusCode, 200);
  assert.equal(directFacebookRes.headers["cache-control"], "private, no-store");
  assert.equal(directFacebookRes.headers.vary, "User-Agent");
  assert.match(directFacebookRes.body, /inappbrowserescaper\.js/);
  assert.match(directFacebookRes.body, /data-open-external/);
  assert.doesNotMatch(directFacebookRes.body, /Nội dung<\/p>/);

  const directBotRes = response();
  await publicPageHandler(request("GET", {
    query: { slug },
    userAgent: "facebookexternalhit/1.1",
  }), directBotRes);
  assert.match(directBotRes.body, /og:title/);
  assert.match(directBotRes.body, /Nội dung<\/p>/);
  assert.doesNotMatch(directBotRes.body, /inappbrowserescaper\.js/);

  const directBrowserRes = response();
  await publicPageHandler(request("GET", {
    query: { slug },
    userAgent: "Mozilla/5.0 Chrome/140.0",
  }), directBrowserRes);
  assert.match(directBrowserRes.body, /Nội dung<\/p>/);
  assert.doesNotMatch(directBrowserRes.body, /inappbrowserescaper\.js/);

  const defaultPromoRes = response();
  await promoHandler(request("GET", { query: { campaign: "default" }, userAgent: MOBILE_USER_AGENT }), defaultPromoRes);
  assert.equal(defaultPromoRes.statusCode, 200);
  assert.equal(parsed(defaultPromoRes).data.campaignId, "default");
  assert.equal(parsed(defaultPromoRes).data.enabled, true);
  assert.equal(parsed(defaultPromoRes).data.tiktokUrl, "https://www.tiktok.com/");
  assert.equal(parsed(defaultPromoRes).data.promoOrder, "tiktok-first");
  assert.deepEqual(parsed(defaultPromoRes).data.followUp, {
    enabled: false,
    imageUrl: "",
    targetUrl: "",
    delayMs: 1000,
  });

  await saveSettings({
    ...DEFAULT_SETTINGS,
    shopeeEnabled: true,
    shopeeImageUrl: "https://cdn.example.com/shopee-banner.webp",
    shopeeUrl: "https://vt.tiktok.com/AbCd12",
    promoOrder: "shopee-first",
  });
  const shopeePromoRes = response();
  await promoHandler(request("GET", { query: { campaign: "default" }, userAgent: MOBILE_USER_AGENT }), shopeePromoRes);
  assert.deepEqual(parsed(shopeePromoRes).data.followUp, {
    enabled: true,
    imageUrl: "https://cdn.example.com/shopee-banner.webp",
    targetUrl: "https://vt.tiktok.com/AbCd12",
    delayMs: 1000,
  });
  assert.equal(parsed(shopeePromoRes).data.promoOrder, "shopee-first");
  await saveSettings(DEFAULT_SETTINGS);

  const shimRes = response();
  const originalShimFetch = global.fetch;
  global.fetch = async () => ({
    headers: { get: (name) => (name.toLowerCase() === "location" ? "https://shop.tiktok.com/vn/pdp/1736162251526342591" : null) },
  });
  try {
    await createShimHandler(request("POST", {
      cookie,
      mutation: true,
      body: { postSlug: slug, url: "https://vt.tiktok.com/abc123" },
    }), shimRes);
  } finally {
    global.fetch = originalShimFetch;
  }
  const campaignId = parsed(shimRes).id;
  assert.match(campaignId, /^[a-f0-9]{12}$/);

  const browserRes = response();
  await profileHandler(request("GET", { query: { id: campaignId }, userAgent: "Mozilla/5.0 Chrome" }), browserRes);
  assert.equal(browserRes.statusCode, 302);
  assert.match(browserRes.headers.location, new RegExp(`/${slug}/\\?promo=${campaignId}$`));

  const botRes = response();
  await profileHandler(request("GET", { query: { id: campaignId }, userAgent: "facebookexternalhit/1.1" }), botRes);
  assert.equal(botRes.statusCode, 200);
  assert.match(botRes.body, /og:title/);
  assert.doesNotMatch(botRes.body, /inappbrowserescaper\.js/);

  const promoRes = response();
  await promoHandler(request("GET", { query: { campaign: campaignId }, userAgent: MOBILE_USER_AGENT }), promoRes);
  assert.equal(promoRes.statusCode, 200);
  assert.equal(parsed(promoRes).data.tiktokUrl, "https://www.tiktok.com/view/product/1736162251526342591");
});

test("crawl endpoint imports a WordPress batch and reports progress", async () => {
  process.env.ADMIN_PASSWORD = "crawl-password";
  process.env.ADMIN_SESSION_SECRET = "crawl-secret-that-is-long-enough";
  const token = require("../lib/auth").createSessionToken(process.env.ADMIN_SESSION_SECRET);
  const cookie = `admin_session=${token}`;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /after=2026-08-01T00%3A00%3A00/);
    return new Response(JSON.stringify([{
      id: 99123,
      slug: "crawler-fixture",
      link: "https://nhieuchuyenduongpho.com/2026/08/01/crawler-fixture/",
      date: "2026-08-01T08:00:00",
      modified: "2026-08-01T09:00:00",
      title: { rendered: "Bài từ crawler" },
      excerpt: { rendered: "<p>Mô tả crawler</p>" },
      content: { rendered: '<p>Nội dung</p><video src="https://nhieuchuyenduongpho.com/wp-content/uploads/demo.mp4"></video>' },
    }]), { status: 200, headers: { "x-wp-total": "1", "x-wp-totalpages": "1", "content-type": "application/json" } });
  };
  try {
    const crawlRes = response();
    await crawlHandler(request("POST", { cookie, mutation: true, body: { fromDate: "2026-08-01", toDate: "2026-08-01", page: 1 } }), crawlRes);
    assert.equal(crawlRes.statusCode, 200);
    assert.deepEqual(parsed(crawlRes).data, {
      page: 1,
      totalPages: 1,
      total: 1,
      processed: 1,
      errors: [],
      completed: true,
      nextPage: null,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("crawl endpoint accepts a bounded batch fetched by the authenticated admin browser", async () => {
  process.env.ADMIN_PASSWORD = "browser-crawl-password";
  process.env.ADMIN_SESSION_SECRET = "browser-crawl-secret-that-is-long-enough";
  const token = require("../lib/auth").createSessionToken(process.env.ADMIN_SESSION_SECRET);
  const cookie = `admin_session=${token}`;
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("Server fetch must not run for browser-provided batches"); };
  try {
    const crawlRes = response();
    await crawlHandler(request("POST", {
      cookie,
      mutation: true,
      body: {
        fromDate: "2026-08-08",
        toDate: "2026-08-08",
        page: 1,
        total: 21,
        totalPages: 2,
        items: [{
          id: 99124,
          slug: "browser-crawler-fixture",
          link: "https://nhieuchuyenduongpho.com/2026/08/08/browser-crawler-fixture/",
          date: "2026-08-08T08:00:00",
          modified: "2026-08-08T09:00:00",
          title: { rendered: "Bài do trình duyệt tải" },
          excerpt: { rendered: "<p>Mô tả</p>" },
          content: { rendered: "<p>Nội dung</p>" },
        }],
      },
    }), crawlRes);
    assert.equal(crawlRes.statusCode, 200);
    assert.deepEqual(parsed(crawlRes).data, {
      page: 1,
      totalPages: 2,
      total: 21,
      processed: 1,
      errors: [],
      completed: false,
      nextPage: 2,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("crawl endpoint accepts the allowlisted Hóng Hớt Đường source", async () => {
  process.env.ADMIN_PASSWORD = "honghot-crawl-password";
  process.env.ADMIN_SESSION_SECRET = "honghot-crawl-secret-that-is-long-enough";
  const token = require("../lib/auth").createSessionToken(process.env.ADMIN_SESSION_SECRET);
  const cookie = `admin_session=${token}`;
  const crawlRes = response();
  await crawlHandler(request("POST", {
    cookie,
    mutation: true,
    body: {
      sourceOrigin: "https://honghotduong.com",
      fromDate: "2026-08-09",
      toDate: "2026-08-09",
      page: 1,
      total: 1,
      totalPages: 1,
      items: [{
        id: 30256,
        slug: "chiec-xe-amanh-nhat-luc-nay",
        link: "https://honghotduong.com/2026/08/09/chiec-xe-amanh-nhat-luc-nay/",
        date: "2026-08-09T20:52:31",
        modified: "2026-08-09T20:52:31",
        title: { rendered: "Chiếc xe amanh nhất lúc này" },
        excerpt: { rendered: "<p>Khổ thân bác tài</p>" },
        content: { rendered: '<video src="https://cdn.videy.co/V6P4o2LX1.mp4"></video>' },
      }],
    },
  }), crawlRes);
  assert.equal(crawlRes.statusCode, 200);
  assert.equal(parsed(crawlRes).data.processed, 1);
  assert.deepEqual(parsed(crawlRes).data.errors, []);
});

test("crawl endpoint imports Hongbienpro content and skips redirect wrappers", async () => {
  process.env.ADMIN_PASSWORD = "hongbien-crawl-password";
  process.env.ADMIN_SESSION_SECRET = "hongbien-crawl-secret-that-is-long-enough";
  const token = require("../lib/auth").createSessionToken(process.env.ADMIN_SESSION_SECRET);
  const cookie = `admin_session=${token}`;
  const targetUrl = "https://hongbienpro.com/2026/08/11/bai-noi-dung-that/";
  const crawlRes = response();
  await crawlHandler(request("POST", {
    cookie,
    mutation: true,
    body: {
      sourceOrigin: "https://hongbienpro.com",
      fromDate: "2026-08-11",
      toDate: "2026-08-11",
      page: 1,
      total: 2,
      totalPages: 1,
      items: [{
        id: 20460,
        slug: "trang-chuyen-tiep",
        link: "https://hongbienpro.com/2026/08/11/trang-chuyen-tiep/",
        date: "2026-08-11T20:10:07",
        title: { rendered: "Trang chuyển tiếp" },
        content: { rendered: `<!DOCTYPE html><script>const redirectURL = "${targetUrl}";</script>` },
      }, {
        id: 20459,
        slug: "bai-noi-dung-that",
        link: targetUrl,
        date: "2026-08-11T20:09:37",
        modified: "2026-08-11T20:09:38",
        title: { rendered: "Bài nội dung thật" },
        excerpt: { rendered: "<p>Mô tả</p>" },
        content: { rendered: '<video src="https://cdn.videy.co/Rb5LRlm71.mp4"></video>' },
      }],
    },
  }), crawlRes);
  assert.equal(crawlRes.statusCode, 200);
  assert.equal(parsed(crawlRes).data.processed, 1);
  assert.deepEqual(parsed(crawlRes).data.errors, []);
});

test("legacy encoded article slugs render the canonical single-encoded URL", async () => {
  const id = "wp-hongbienpro-com-legacy-emoji";
  const encodedSlug = "%e2%9d%97%ef%b8%8fngay-luc-nay-%f0%9f%99%8f";
  await savePost({
    id,
    slug: encodedSlug,
    permalink: `/2026/08/11/${encodeURIComponent(encodedSlug)}/`,
    title: "Bài emoji",
    excerpt: "",
    contentHtml: "<p>Nội dung</p>",
    videos: [],
    status: "published",
    publishedAt: "2026-08-11T13:58:00",
  });
  try {
    for (const slug of [encodedSlug, "❗️ngay-luc-nay-🙏"]) {
      const pageRes = response();
      await publicPageHandler(request("GET", {
        query: { slug },
        userAgent: "Mozilla/5.0 Chrome/140.0",
      }), pageRes);
      assert.equal(pageRes.statusCode, 200);
      assert.match(pageRes.body, /\/2026\/08\/11\/%E2%9D%97%EF%B8%8Fngay-luc-nay-%F0%9F%99%8F\//);
      assert.doesNotMatch(pageRes.body, /%25e2/i);
    }
  } finally {
    await deletePost(id);
  }
});

test("admin can move posts to trash, restore them, and permanently delete only from trash", async () => {
  process.env.ADMIN_PASSWORD = "trash-password";
  process.env.ADMIN_SESSION_SECRET = "trash-secret-that-is-long-enough";
  const token = require("../lib/auth").createSessionToken(process.env.ADMIN_SESSION_SECRET);
  const cookie = `admin_session=${token}`;
  const id = `trash-api-${Date.now()}`;
  const slug = `trash-api-${Date.now()}`;
  await savePost({
    id,
    slug,
    title: "Bài kiểm thử thùng rác",
    excerpt: "",
    contentHtml: "<p>Nội dung</p>",
    videos: [],
    status: "published",
    publishedAt: "2026-08-11T15:00:00.000Z",
  });

  try {
    const invalidOperationRes = response();
    await postHandler(request("PATCH", {
      cookie,
      mutation: true,
      query: { id },
      body: { operation: "unknown" },
    }), invalidOperationRes);
    assert.equal(invalidOperationRes.statusCode, 422);

    const restoreActiveRes = response();
    await postHandler(request("PATCH", {
      cookie,
      mutation: true,
      query: { id },
      body: { operation: "restore" },
    }), restoreActiveRes);
    assert.equal(restoreActiveRes.statusCode, 409);

    const unsafePermanentRes = response();
    await postHandler(request("DELETE", { cookie, mutation: true, query: { id, permanent: "1" } }), unsafePermanentRes);
    assert.equal(unsafePermanentRes.statusCode, 409);

    const trashRes = response();
    await postHandler(request("DELETE", { cookie, mutation: true, query: { id } }), trashRes);
    assert.equal(trashRes.statusCode, 200);
    assert.ok(parsed(trashRes).data.deletedAt);

    const editTrashedRes = response();
    await postHandler(request("PUT", {
      cookie,
      mutation: true,
      query: { id },
      body: { title: "Không được cập nhật" },
    }), editTrashedRes);
    assert.equal(editTrashedRes.statusCode, 409);

    const publicMissingRes = response();
    await publicPostHandler(request("GET", { query: { slug } }), publicMissingRes);
    assert.equal(publicMissingRes.statusCode, 404);

    const activeRes = response();
    await postsHandler(request("GET", { cookie, query: { page: 1, limit: 50 } }), activeRes);
    assert.equal(parsed(activeRes).data.posts.some((post) => post.id === id), false);

    const filteredOutRes = response();
    await postsHandler(request("GET", { cookie, query: { page: 1, limit: 50, date: "2026-08-10" } }), filteredOutRes);
    assert.equal(parsed(filteredOutRes).data.posts.some((post) => post.id === id), false);

    const trashListRes = response();
    await postsHandler(request("GET", { cookie, query: { page: 1, limit: 50, trash: "1" } }), trashListRes);
    assert.equal(parsed(trashListRes).data.posts.some((post) => post.id === id), true);

    const restoreRes = response();
    await postHandler(request("PATCH", {
      cookie,
      mutation: true,
      query: { id },
      body: { operation: "restore" },
    }), restoreRes);
    assert.equal(restoreRes.statusCode, 200);
    assert.equal(parsed(restoreRes).data.deletedAt, undefined);

    const publicRestoredRes = response();
    await publicPostHandler(request("GET", { query: { slug } }), publicRestoredRes);
    assert.equal(publicRestoredRes.statusCode, 200);

    const filteredInRes = response();
    await postsHandler(request("GET", { cookie, query: { page: 1, limit: 50, date: "2026-08-11" } }), filteredInRes);
    assert.equal(parsed(filteredInRes).data.posts.some((post) => post.id === id), true);

    const invalidDateRes = response();
    await postsHandler(request("GET", { cookie, query: { date: "11/08/2026" } }), invalidDateRes);
    assert.equal(invalidDateRes.statusCode, 422);

    await postHandler(request("DELETE", { cookie, mutation: true, query: { id } }), response());
    const permanentRes = response();
    await postHandler(request("DELETE", { cookie, mutation: true, query: { id, permanent: "1" } }), permanentRes);
    assert.equal(permanentRes.statusCode, 200);

    const missingRes = response();
    await postHandler(request("GET", { cookie, query: { id } }), missingRes);
    assert.equal(missingRes.statusCode, 404);
  } finally {
    await deletePost(id);
  }
});
