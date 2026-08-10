const test = require("node:test");
const assert = require("node:assert/strict");

const { createRouteDispatcher } = require("../lib/route-dispatch");

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(value = "") { this.body += value; },
  };
}

test("route dispatcher only invokes explicitly registered actions", async () => {
  const calls = [];
  const dispatch = createRouteDispatcher({ known: async (req, res) => { calls.push(req.query.action); res.end("ok"); } });
  const allowed = response();
  await dispatch({ query: { action: "known" } }, allowed);
  assert.equal(allowed.body, "ok");
  assert.deepEqual(calls, ["known"]);

  const missing = response();
  await dispatch({ query: { action: "toString" } }, missing);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(JSON.parse(missing.body), { success: false, error: "Endpoint không tồn tại" });
});
