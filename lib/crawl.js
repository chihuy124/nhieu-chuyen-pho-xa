const SOURCE_ORIGIN = "https://nhieuchuyenduongpho.com";
const SOURCE_ORIGINS = Object.freeze([
  SOURCE_ORIGIN,
  "https://honghotduong.com",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeWordPressSourceOrigin(value = SOURCE_ORIGIN) {
  let origin;
  try {
    const url = new URL(String(value || SOURCE_ORIGIN));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid");
    origin = url.origin;
  } catch (_error) {
    throw new Error("Nguồn WordPress không hợp lệ");
  }
  if (!SOURCE_ORIGINS.includes(origin)) throw new Error("Nguồn WordPress không được phép");
  return origin;
}

function assertCalendarDate(value) {
  if (!DATE_RE.test(value)) throw new Error("Ngày không hợp lệ");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error("Ngày không hợp lệ");
  }
  return date;
}

function normalizeDateRange(fromDate, toDate) {
  const from = assertCalendarDate(String(fromDate || ""));
  const to = assertCalendarDate(String(toDate || ""));
  if (from > to) throw new Error("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc");
  const durationDays = Math.floor((to - from) / 86_400_000) + 1;
  if (durationDays > 366) throw new Error("Khoảng crawl tối đa là 366 ngày");
  return {
    fromDate,
    toDate,
    after: `${fromDate}T00:00:00`,
    before: `${toDate}T23:59:59`,
  };
}

function parsePositivePage(value) {
  if (value === undefined || value === null || value === "") return 1;
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) throw new Error("Trang crawl không hợp lệ");
  return page;
}

function buildWordPressPostsUrl({ sourceOrigin = SOURCE_ORIGIN, after, before, page = 1, perPage = 20 }) {
  const safePage = parsePositivePage(page);
  const safePerPage = Number(perPage);
  if (!Number.isInteger(safePerPage) || safePerPage < 1 || safePerPage > 100) {
    throw new Error("Kích thước batch không hợp lệ");
  }
  const url = new URL("/wp-json/wp/v2/posts", normalizeWordPressSourceOrigin(sourceOrigin));
  url.searchParams.set("after", after);
  url.searchParams.set("before", before);
  url.searchParams.set("page", String(safePage));
  url.searchParams.set("per_page", String(safePerPage));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "asc");
  url.searchParams.set("_embed", "1");
  return url.toString();
}

function parseWordPressJson(value) {
  const input = String(value || "").replace(/^\uFEFF/, "");
  const withoutLeadingComments = input.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, "");
  const clean = withoutLeadingComments.replace(/(?:\s*<!--[\s\S]*?-->\s*)+$/, "");
  try {
    return JSON.parse(clean);
  } catch (_error) {
    throw new Error("Nguồn WordPress trả về dữ liệu không phải JSON");
  }
}

function retryDelayMs(response, attempt) {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = retryAfterHeader === null || retryAfterHeader.trim() === "" ? NaN : Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(8_000, retryAfter * 1_000);
  return Math.min(8_000, attempt * 500);
}

async function fetchWordPressPage(url, options = {}) {
  const attempts = Math.max(1, Math.min(5, Number(options.attempts) || 3));
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    let responseText;
    try {
      const requestOptions = { ...(options.requestOptions || {}) };
      if (!requestOptions.signal && typeof AbortSignal?.timeout === "function") {
        requestOptions.signal = AbortSignal.timeout(Number(options.timeoutMs) || 20_000);
      }
      response = await fetchImpl(url, requestOptions);
      responseText = await response.text();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(Math.min(8_000, attempt * 500));
      continue;
    }
    let invalidSuccessBody = false;
    if (response.ok) {
      try { parseWordPressJson(responseText); } catch (_error) { invalidSuccessBody = true; }
    }
    const transient = response.status === 429 || response.status >= 500 || invalidSuccessBody;
    if (!transient || attempt >= attempts) return { response, responseText };
    await sleep(retryDelayMs(response, attempt));
  }
  throw new Error("Không thể kết nối nguồn WordPress");
}

function validateClientWordPressBatch(items, range, sourceOrigin = SOURCE_ORIGIN) {
  if (!Array.isArray(items) || items.length > 20) throw new Error("Batch WordPress không hợp lệ");
  if (JSON.stringify(items).length > 5_000_000) throw new Error("Batch WordPress vượt quá dung lượng cho phép");
  const allowedOrigin = normalizeWordPressSourceOrigin(sourceOrigin);
  return items.map((item) => {
    if (!item || !Number.isInteger(Number(item.id))) throw new Error("Bài viết nguồn không hợp lệ");
    let link;
    try { link = new URL(String(item.link || "")); } catch (_error) { throw new Error("Liên kết bài viết nguồn không hợp lệ"); }
    if (link.origin !== allowedOrigin) throw new Error("Bài viết không thuộc nguồn được phép");
    const itemDate = String(item.date || "").slice(0, 10);
    if (itemDate < range.fromDate || itemDate > range.toDate) throw new Error("Bài viết nằm ngoài khoảng ngày crawl");
    return { ...item };
  });
}

module.exports = {
  SOURCE_ORIGIN,
  SOURCE_ORIGINS,
  buildWordPressPostsUrl,
  fetchWordPressPage,
  normalizeDateRange,
  normalizeWordPressSourceOrigin,
  parseWordPressJson,
  parsePositivePage,
  validateClientWordPressBatch,
};
