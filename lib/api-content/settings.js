const { getSettings } = require("../../lib/content-store");
const { json, requireMethod } = require("../../lib/http");

// Chỉ những gì giao diện công khai thực sự cần. Cấu hình quảng cáo, nhất là link
// affiliate, đi riêng qua promo để không nằm sẵn trong phản hồi ai cũng tải được.
const PUBLIC_SETTINGS_KEYS = ["siteTitle", "siteDescription", "logoUrl", "fanpageUrl"];

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;
  try {
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    const settings = await getSettings();
    const publicSettings = Object.fromEntries(PUBLIC_SETTINGS_KEYS.map((key) => [key, settings[key]]));
    return json(res, 200, { success: true, data: publicSettings });
  } catch (_error) {
    return json(res, 500, { success: false, error: "Không thể tải cấu hình website" });
  }
};
