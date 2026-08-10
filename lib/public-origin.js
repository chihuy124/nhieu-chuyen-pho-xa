function publicOrigin(req) {
  const configured = process.env.PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (configured) {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("PUBLIC_SITE_URL không hợp lệ");
    }
    return url.origin;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Thiếu PUBLIC_SITE_URL");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000")
    .split(",")[0]
    .trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return "http://localhost:3000";
  return `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${host}`;
}

module.exports = { publicOrigin };
