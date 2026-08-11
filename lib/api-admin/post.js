const { requireAdmin } = require("../../lib/admin-guard");
const {
  deletePost,
  getPost,
  restorePost,
  savePost,
  trashPost,
} = require("../../lib/content-store");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { validatePostInput } = require("../../lib/validators");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET", "PUT", "PATCH", "DELETE"]) || !requireAdmin(req, res)) return;
  const id = String(req.query?.id || "").trim();
  if (!id) return json(res, 400, { success: false, error: "Thiếu ID bài viết" });
  try {
    const existing = await getPost(id);
    if (!existing) return json(res, 404, { success: false, error: "Không tìm thấy bài viết" });
    if (req.method === "GET") return json(res, 200, { success: true, data: existing });
    if (!requireMutationHeader(req, res)) return;
    if (req.method === "DELETE") {
      if (String(req.query?.permanent || "") === "1") {
        if (!existing.deletedAt) return json(res, 409, { success: false, error: "Chỉ có thể xóa vĩnh viễn bài viết trong thùng rác" });
        await deletePost(id);
        return json(res, 200, { success: true });
      }
      const trashed = await trashPost(id);
      return json(res, 200, { success: true, data: trashed });
    }
    if (req.method === "PATCH") {
      const body = await readJson(req);
      if (body?.operation !== "restore") return json(res, 422, { success: false, error: "Thao tác không hợp lệ" });
      if (!existing.deletedAt) return json(res, 409, { success: false, error: "Bài viết không nằm trong thùng rác" });
      const restored = await restorePost(id);
      return json(res, 200, { success: true, data: restored });
    }
    if (existing.deletedAt) return json(res, 409, { success: false, error: "Hãy khôi phục bài viết trước khi chỉnh sửa" });
    const saved = await savePost(validatePostInput(await readJson(req), existing));
    return json(res, 200, { success: true, data: saved });
  } catch (error) {
    return json(res, 422, { success: false, error: error.message || "Không thể cập nhật bài viết" });
  }
};
