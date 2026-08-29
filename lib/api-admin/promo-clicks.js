const { requireAdmin } = require("../../lib/admin-guard");
const { json, requireMethod } = require("../../lib/http");
const { readPromoClicks } = require("../../lib/promo-clicks");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET"]) || !requireAdmin(req, res)) return;
  try {
    const data = await readPromoClicks({ days: req.query?.days, date: req.query?.date });
    return json(res, 200, { success: true, data });
  } catch (error) {
    return json(res, 422, { success: false, error: error.message || "Không thể tải thống kê click" });
  }
};
