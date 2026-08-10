const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWordPressPostsUrl,
  fetchWordPressPage,
  normalizeDateRange,
  parseWordPressJson,
  parsePositivePage,
  validateClientWordPressBatch,
  normalizeWordPressSourceOrigin,
} = require("../lib/crawl");

test("WordPress fetch retries transient 503 and HTML maintenance responses", async () => {
  const sleeps = [];
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("<html>Vui lòng đợi</html>", { status: 503, headers: { "retry-after": "2", "content-type": "text/html" } });
    }
    if (calls === 2) {
      return new Response("<html>temporary page</html>", { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response('[{"id":7651}]', { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await fetchWordPressPage("https://nhieuchuyenduongpho.com/wp-json/wp/v2/posts", {
    attempts: 3,
    fetchImpl,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [2000, 1000]);
  assert.equal(result.response.status, 200);
  assert.deepEqual(JSON.parse(result.responseText), [{ id: 7651 }]);
});

test("WordPress fetch does not retry permanent 4xx responses", async () => {
  let calls = 0;
  const result = await fetchWordPressPage("https://nhieuchuyenduongpho.com/wp-json/wp/v2/posts", {
    fetchImpl: async () => {
      calls += 1;
      return new Response('{"code":"rest_invalid_param"}', { status: 400 });
    },
    sleep: async () => assert.fail("Permanent errors must not sleep"),
  });
  assert.equal(calls, 1);
  assert.equal(result.response.status, 400);
});

test("date range is inclusive and bounded", () => {
  assert.deepEqual(normalizeDateRange("2026-08-01", "2026-08-08"), {
    fromDate: "2026-08-01",
    toDate: "2026-08-08",
    after: "2026-08-01T00:00:00",
    before: "2026-08-08T23:59:59",
  });
  assert.throws(() => normalizeDateRange("2026-08-08", "2026-08-01"), /Ngày bắt đầu/);
  assert.throws(() => normalizeDateRange("2026-13-01", "2026-13-02"), /không hợp lệ/);
  assert.throws(() => normalizeDateRange("2025-01-01", "2026-01-02"), /366 ngày/);
});

test("WordPress URL is fixed to the configured source and paginated", () => {
  const url = new URL(buildWordPressPostsUrl({
    after: "2026-08-01T00:00:00",
    before: "2026-08-08T23:59:59",
    page: 3,
    perPage: 20,
  }));
  assert.equal(url.origin, "https://nhieuchuyenduongpho.com");
  assert.equal(url.pathname, "/wp-json/wp/v2/posts");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("per_page"), "20");
  assert.equal(url.searchParams.get("_embed"), "1");
});

test("WordPress source allowlist accepts Hóng Hớt Đường and rejects SSRF targets", () => {
  assert.equal(normalizeWordPressSourceOrigin(), "https://nhieuchuyenduongpho.com");
  assert.equal(normalizeWordPressSourceOrigin("https://honghotduong.com"), "https://honghotduong.com");
  assert.equal(normalizeWordPressSourceOrigin("https://honghotduong.com/"), "https://honghotduong.com");
  assert.throws(() => normalizeWordPressSourceOrigin("https://evil.example"), /Nguồn WordPress/);
  assert.throws(() => normalizeWordPressSourceOrigin("https://honghotduong.com.evil.example"), /Nguồn WordPress/);
  const url = new URL(buildWordPressPostsUrl({
    sourceOrigin: "https://honghotduong.com",
    after: "2026-08-09T00:00:00",
    before: "2026-08-09T23:59:59",
  }));
  assert.equal(url.origin, "https://honghotduong.com");
});

test("crawl page parsing rejects invalid values", () => {
  assert.equal(parsePositivePage(undefined), 1);
  assert.equal(parsePositivePage("4"), 4);
  assert.throws(() => parsePositivePage("0"), /Trang crawl/);
  assert.throws(() => parsePositivePage("abc"), /Trang crawl/);
});

test("WordPress batch size is restricted", () => {
  assert.throws(() => buildWordPressPostsUrl({ after: "x", before: "y", perPage: 101 }), /batch/);
  assert.throws(() => buildWordPressPostsUrl({ after: "x", before: "y", perPage: 0 }), /batch/);
});

test("WordPress JSON parser tolerates boundary comments but rejects HTML pages", () => {
  assert.deepEqual(
    parseWordPressJson('<!-- OnePage cache marker -->\n[{"id":7651}]\n<!-- end -->'),
    [{ id: 7651 }],
  );
  assert.deepEqual(parseWordPressJson('\uFEFF {"code":"rest_post_invalid_page_number"}'), {
    code: "rest_post_invalid_page_number",
  });
  assert.throws(() => parseWordPressJson("<html>blocked</html>"), /không phải JSON/);
});

test("client crawl batches are bounded to the configured source and date range", () => {
  const range = normalizeDateRange("2026-08-01", "2026-08-08");
  const source = { id: 7651, date: "2026-08-08T09:00:00", link: "https://nhieuchuyenduongpho.com/2026/08/08/example/" };
  assert.deepEqual(validateClientWordPressBatch([source], range), [source]);
  assert.throws(() => validateClientWordPressBatch({}, range), /Batch WordPress/);
  assert.throws(() => validateClientWordPressBatch([null], range), /Bài viết nguồn/);
  assert.throws(() => validateClientWordPressBatch([{ ...source, link: "not-a-url" }], range), /Liên kết/);
  assert.throws(() => validateClientWordPressBatch([{ ...source, link: "https://evil.example/post" }], range), /không thuộc nguồn/);
  assert.throws(() => validateClientWordPressBatch([{ ...source, date: "2026-08-09T00:00:00" }], range), /ngoài khoảng ngày/);
  assert.throws(() => validateClientWordPressBatch(Array.from({ length: 21 }, () => source), range), /Batch WordPress/);
  const hongHotPost = { id: 30256, date: "2026-08-08T09:00:00", link: "https://honghotduong.com/2026/08/08/chiec-xe/" };
  assert.deepEqual(validateClientWordPressBatch([hongHotPost], range, "https://honghotduong.com"), [hongHotPost]);
  assert.throws(() => validateClientWordPressBatch([hongHotPost], range), /không thuộc nguồn/);
});
