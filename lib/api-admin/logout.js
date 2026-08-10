const { sessionCookie } = require("../../lib/auth");
const { json, requireMethod, requireMutationHeader } = require("../../lib/http");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ["POST"]) || !requireMutationHeader(req, res)) return;
  return json(res, 200, { success: true }, { "set-cookie": sessionCookie("", { clear: true }) });
};
