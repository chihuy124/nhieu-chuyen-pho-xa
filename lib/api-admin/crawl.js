const { requireAdmin } = require("../../lib/admin-guard");
const { normalizeWordPressPost } = require("../../lib/content");
const { savePost } = require("../../lib/content-store");
const {
  buildWordPressPostsUrl,
  fetchWordPressPage,
  normalizeDateRange,
  normalizeWordPressSourceOrigin,
  parsePositivePage,
  parseWordPressJson,
  validateClientWordPressBatch,
} = require("../../lib/crawl");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { checkRateLimit } = require("../../lib/rate-limit");

module.exports = async (req, res) => {
  if (
    !requireMethod(req, res, ["POST"])
    || !requireAdmin(req, res)
    || !requireMutationHeader(req, res)
  ) return;
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const limit = await checkRateLimit("admin-crawl", ip, 300, 60 * 60);
    if (!limit.allowed) return json(res, 429, { success: false, error: "Đã vượt giới hạn crawl trong một giờ" });
    const body = await readJson(req);
    const sourceOrigin = normalizeWordPressSourceOrigin(body.sourceOrigin);
    const range = normalizeDateRange(String(body.fromDate || ""), String(body.toDate || ""));
    const page = parsePositivePage(body.page);
    const perPage = 20;
    let items;
    let totalPages;
    let total;
    if (body.items !== undefined) {
      items = validateClientWordPressBatch(body.items, range, sourceOrigin);
      totalPages = Math.max(page, Math.min(10_000, Number(body.totalPages) || page));
      total = Math.max(items.length, Math.min(1_000_000, Number(body.total) || items.length));
    } else {
      const sourceUrl = buildWordPressPostsUrl({ sourceOrigin, ...range, page, perPage });
      const { response, responseText } = await fetchWordPressPage(sourceUrl, {
        attempts: 3,
        requestOptions: {
          headers: { accept: "application/json", "user-agent": "NCDP-Content-Sync/1.0" },
          redirect: "error",
        },
        timeoutMs: 20_000,
      });
      if (!response.ok) {
        let upstreamError = {};
        try { upstreamError = parseWordPressJson(responseText); } catch (_error) { upstreamError = {}; }
        if (response.status === 400 && page > 1 && upstreamError.code === "rest_post_invalid_page_number") {
          return json(res, 200, { success: true, data: { page, totalPages: page - 1, processed: 0, completed: true } });
        }
        throw new Error(`Nguồn WordPress trả về mã ${response.status}${upstreamError.message ? `: ${upstreamError.message}` : ""}`);
      }
      items = parseWordPressJson(responseText);
      totalPages = Math.max(1, Number(response.headers.get("x-wp-totalpages")) || page);
      total = Number(response.headers.get("x-wp-total")) || items.length;
    }
    if (!Array.isArray(items)) throw new Error("Dữ liệu WordPress không đúng định dạng");
    const saved = [];
    const errors = [];
    for (const item of items) {
      try {
        const normalized = normalizeWordPressPost(item);
        saved.push(await savePost(normalized));
      } catch (error) {
        errors.push({ sourceId: item?.id || null, error: error.message || "Không thể nhập bài" });
      }
    }
    return json(res, 200, {
      success: true,
      data: {
        page,
        totalPages,
        total: total || saved.length,
        processed: saved.length,
        errors,
        completed: page >= totalPages,
        nextPage: page < totalPages ? page + 1 : null,
      },
    });
  } catch (error) {
    return json(res, 422, { success: false, error: error.message || "Không thể crawl dữ liệu" });
  }
};
