const { getKv } = require("../../lib/kv");
const kv = getKv();

async function put(id, url) {
  await kv.set(`shim:${id}`, url);
}

async function get(id) {
  return kv.get(`shim:${id}`);
}

module.exports = { put, get };
