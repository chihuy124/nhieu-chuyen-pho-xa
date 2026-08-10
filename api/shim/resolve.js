const { get } = require("./store");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Missing id" }));
    return;
  }

  const record = await get(id);
  if (!record) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/json");

  const url = typeof record === "string" ? record : record.tiktokUrl;
  res.end(JSON.stringify({ url }));
};
