const { requireAdmin } = require("../../lib/admin-guard");
const { getSettings, saveSettings } = require("../../lib/content-store");
const { json, readJson, requireMethod, requireMutationHeader } = require("../../lib/http");
const { resolveSettingsLinks } = require("../../lib/tiktok-link");
const { validateSettingsInput } = require("../../lib/validators");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET", "PUT"]) || !requireAdmin(req, res)) return;
  try {
    const existing = await getSettings();
    if (req.method === "GET") return json(res, 200, { success: true, data: existing });
    if (!requireMutationHeader(req, res)) return;
    const input = await resolveSettingsLinks(await readJson(req));
    const saved = await saveSettings(validateSettingsInput(input, existing));
    return json(res, 200, { success: true, data: saved });
  } catch (error) {
    return json(res, 422, { success: false, error: error.message || "Cấu hình không hợp lệ" });
  }
};
