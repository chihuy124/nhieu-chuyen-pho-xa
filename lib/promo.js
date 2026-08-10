function promoStorageKey(campaignId) {
  return `ncdp:promo-seen:${String(campaignId || "").trim()}`;
}

function shouldShowPromo({ campaignId, enabled, seen }) {
  return Boolean(String(campaignId || "").trim() && enabled && !seen);
}

module.exports = { promoStorageKey, shouldShowPromo };
