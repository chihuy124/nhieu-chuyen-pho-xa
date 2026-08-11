const { kv: vercelKv } = require("@vercel/kv");

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function createMemoryKv() {
  const values = new Map();
  const sortedSets = new Map();
  return {
    async get(key) { return clone(values.get(key) ?? null); },
    async set(key, value, options = {}) {
      if (options.nx && values.has(key)) return null;
      values.set(key, clone(value));
      return "OK";
    },
    async del(...keys) { let removed = 0; keys.forEach((key) => { if (values.delete(key)) removed += 1; }); return removed; },
    async mget(...keys) { return keys.map((key) => clone(values.get(key) ?? null)); },
    async incr(key) { const next = Number(values.get(key) || 0) + 1; values.set(key, next); return next; },
    async expire() { return 1; },
    async zadd(key, { score, member }) {
      const set = sortedSets.get(key) || new Map();
      const exists = set.has(member);
      set.set(member, Number(score));
      sortedSets.set(key, set);
      return exists ? 0 : 1;
    },
    async zrem(key, member) { return sortedSets.get(key)?.delete(member) ? 1 : 0; },
    async zcard(key) { return sortedSets.get(key)?.size || 0; },
    async zrange(key, start, stop, options = {}) {
      let entries = [...(sortedSets.get(key) || new Map()).entries()]
        .sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0])));
      if (options.byScore) {
        const minimum = Math.min(Number(start), Number(stop));
        const maximum = Math.max(Number(start), Number(stop));
        entries = entries.filter(([_member, score]) => score >= minimum && score <= maximum);
      }
      if (options.rev) entries.reverse();
      if (options.byScore && Number.isFinite(options.offset) && Number.isFinite(options.count)) {
        return entries.slice(options.offset, options.offset + options.count).map(([member]) => member);
      }
      if (options.byScore) return entries.map(([member]) => member);
      const safeStop = stop < 0 ? entries.length + stop : stop;
      return entries.slice(start, safeStop + 1).map(([member]) => member);
    },
  };
}

function hasRemoteKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

const memoryKv = globalThis.__NCDP_MEMORY_KV || createMemoryKv();
globalThis.__NCDP_MEMORY_KV = memoryKv;

function getKv() {
  if (hasRemoteKvConfig()) return vercelKv;
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    throw new Error("Thiếu KV_REST_API_URL hoặc KV_REST_API_TOKEN");
  }
  return memoryKv;
}

module.exports = { createMemoryKv, getKv, hasRemoteKvConfig };
