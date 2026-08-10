const { getSettings } = require("../../lib/content-store");
const { json, requireMethod } = require("../../lib/http");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return json(res, 200, { success: true, data: await getSettings() });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải cấu hình website" });
  }
};
