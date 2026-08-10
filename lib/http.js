async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  if (!req[Symbol.asyncIterator]) return {};
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Payload quá lớn");
  }
  return JSON.parse(body || "{}");
}

function json(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (!res.getHeader?.("cache-control")) res.setHeader("cache-control", "no-store");
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

function requireMethod(req, res, allowedMethods) {
  if (allowedMethods.includes(req.method)) return true;
  res.setHeader("allow", allowedMethods.join(", "));
  json(res, 405, { success: false, error: "Method not allowed" });
  return false;
}

function requireMutationHeader(req, res) {
  const requestHost = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const forwardedProtocol = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  let origin;
  try { origin = new URL(String(req.headers?.origin || "")); } catch (_error) { origin = null; }
  const requestProtocol = forwardedProtocol || (process.env.NODE_ENV === "production" ? "" : origin?.protocol.replace(":", ""));
  const expectedOrigin = requestProtocol && requestHost ? `${requestProtocol}://${requestHost}` : "";
  if (
    req.headers?.["x-admin-request"] === "1"
    && origin?.protocol === "https:"
    && origin.origin.toLowerCase() === expectedOrigin
  ) return true;
  json(res, 403, { success: false, error: "Yêu cầu quản trị không hợp lệ" });
  return false;
}

module.exports = { json, readJson, requireMethod, requireMutationHeader };
