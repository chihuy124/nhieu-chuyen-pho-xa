const { requireAdmin } = require("../../lib/admin-guard");
const { deletePost, getPost, savePost } = require("../../lib/content-store");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { validatePostInput } = require("../../lib/validators");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET", "PUT", "DELETE"]) || !requireAdmin(req, res)) return;
  const id = String(req.query?.id || "").trim();
  if (!id) return json(res, 400, { success: false, error: "Thiếu ID bài viết" });
  try {
    const existing = await getPost(id);
    if (!existing) return json(res, 404, { success: false, error: "Không tìm thấy bài viết" });
    if (req.method === "GET") return json(res, 200, { success: true, data: existing });
    if (!requireMutationHeader(req, res)) return;
    if (req.method === "DELETE") {
      await deletePost(id);
      return json(res, 200, { success: true });
    }
    const saved = await savePost(validatePostInput(await readJson(req), existing));
    return json(res, 200, { success: true, data: saved });
  } catch (error) {
    return json(res, 422, { success: false, error: error.message || "Không thể cập nhật bài viết" });
  }
};
