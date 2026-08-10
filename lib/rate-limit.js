const crypto = require("crypto");
const { getKv } = require("./kv");
const kv = getKv();

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "unknown")).digest("hex").slice(0, 24);
}

async function checkRateLimit(namespace, subject, limit, windowSeconds, client = kv) {
  const key = `rate:${namespace}:${fingerprint(subject)}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, windowSeconds);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

module.exports = { checkRateLimit, fingerprint };
