const { isAdminRequest } = require("../../lib/auth");
const { json, requireMethod } = require("../../lib/http");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["GET"])) return;
  return json(res, 200, { success: true, authenticated: isAdminRequest(req) });
};
