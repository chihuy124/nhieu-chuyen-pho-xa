const { json } = require("./http");

function createRouteDispatcher(handlers) {
  const routes = Object.freeze({ ...handlers });
  return async function dispatch(req, res) {
    const rawAction = req.query?.action;
    const action = Array.isArray(rawAction) ? rawAction[0] : String(rawAction || "");
    const handler = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
    if (!handler) return json(res, 404, { success: false, error: "Endpoint không tồn tại" });
    return handler(req, res);
  };
}

module.exports = { createRouteDispatcher };
