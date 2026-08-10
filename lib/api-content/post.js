const { getPostBySlug } = require("../../lib/content-store");
const { json, requireMethod } = require("../../lib/http");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    const post = await getPostBySlug(String(req.query?.slug || "").trim());
    if (!post || post.status !== "published") return json(res, 404, { success: false, error: "Không tìm thấy bài viết" });
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return json(res, 200, { success: true, data: post });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải bài viết" });
  }
};
