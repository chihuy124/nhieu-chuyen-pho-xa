const test = require("node:test");
const assert = require("node:assert/strict");

const { promoStorageKey, shouldShowPromo } = require("../lib/promo");

test("promo visibility is scoped to a campaign", () => {
  assert.equal(promoStorageKey("abc-123"), "ncdp:promo-seen:abc-123");
  assert.equal(shouldShowPromo({ campaignId: "abc-123", enabled: true, seen: false }), true);
  assert.equal(shouldShowPromo({ campaignId: "abc-123", enabled: true, seen: true }), false);
  assert.equal(shouldShowPromo({ campaignId: "abc-123", enabled: false, seen: false }), false);
  assert.equal(shouldShowPromo({ campaignId: "", enabled: true, seen: false }), false);
});
