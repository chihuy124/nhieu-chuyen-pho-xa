const { requireAdmin } = require("../../lib/admin-guard");
const { listPosts, savePost } = require("../../lib/content-store");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { validatePostInput } = require("../../lib/validators");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET", "POST"]) || !requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") {
      const result = await listPosts({ page: req.query?.page, limit: req.query?.limit || 20 });
      return json(res, 200, { success: true, data: result });
    }
    if (!requireMutationHeader(req, res)) return;
    const post = validatePostInput(await readJson(req));
    const saved = await savePost(post);
    return json(res, 201, { success: true, data: saved });
  } catch (error) {
    return json(res, 422, { success: false, error: error.message || "Dữ liệu bài viết không hợp lệ" });
  }
};
