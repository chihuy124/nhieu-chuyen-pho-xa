const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSessionToken,
  parseCookies,
  verifyAdminPassword,
  verifySessionToken,
  sessionCookie,
} = require("../lib/auth");

test("admin session token is signed, expires, and rejects tampering", () => {
  const now = 1_800_000_000_000;
  const secret = ["session", "secret", "with", "enough", "length"].join("-");
  const token = createSessionToken(secret, now, 60_000);
  assert.equal(verifySessionToken(token, secret, now + 30_000), true);
  assert.equal(verifySessionToken(token, "wrong-secret", now + 30_000), false);
  assert.equal(verifySessionToken(`${token}x`, secret, now + 30_000), false);
  assert.equal(verifySessionToken(token, secret, now + 61_000), false);
});

test("password verification is timing-safe and environment driven", () => {
  assert.equal(verifyAdminPassword("correct horse", "correct horse"), true);
  assert.equal(verifyAdminPassword("wrong", "correct horse"), false);
  assert.equal(verifyAdminPassword("", "correct horse"), false);
});

test("cookie parser handles multiple cookie values", () => {
  assert.deepEqual(parseCookies("theme=dark; admin_session=abc.def; encoded=x%20y"), {
    theme: "dark",
    admin_session: "abc.def",
    encoded: "x y",
  });
  assert.deepEqual(parseCookies("broken; encoded=%E0%A4%A"), { encoded: "%E0%A4%A" });
});

test("session helpers reject malformed data and serialize clear cookies", () => {
  assert.throws(() => createSessionToken(""), /ADMIN_SESSION_SECRET/);
  assert.equal(verifySessionToken("bad", "secret"), false);
  assert.equal(verifySessionToken("not-json.signature", "secret"), false);
  assert.match(sessionCookie("token"), /^admin_session=token;/);
  assert.match(sessionCookie("", { clear: true }), /Max-Age=0/);
});
