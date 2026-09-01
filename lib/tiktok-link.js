const { isAllowedTikTokUrl, isTikTokProductUrl, normalizeTikTokProductUrl, parseWebUrl } = require("./security");

const SHORT_LINK_HOSTS = ["vt.tiktok.com", "vm.tiktok.com"];
const MAX_HOPS = 3;
const TIMEOUT_MS = 4000;
const SETTINGS_LINK_KEYS = ["defaultTikTokUrl", "shopeeUrl"];

function isShortLink(url) {
  return SHORT_LINK_HOSTS.includes(String(url.hostname || "").toLowerCase());
}

async function resolveTikTokLink(value, options = {}) {
  const { fetchImpl = fetch, maxHops = MAX_HOPS, timeoutMs = TIMEOUT_MS } = options;
  const raw = String(value || "").trim();
  const start = parseWebUrl(raw);
  if (!start || !isAllowedTikTokUrl(raw) || !isShortLink(start)) return normalizeTikTokProductUrl(raw);
  let current = start;
  for (let hop = 0; hop < maxHops; hop += 1) {
    let location;
    try {
      const response = await fetchImpl(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      location = response?.headers?.get?.("location");
    } catch (_error) {
      return raw;
    }
    if (!location) return raw;
    let next;
    try { next = new URL(location, current); } catch (_error) { return raw; }
    if (!isAllowedTikTokUrl(next.toString())) return raw;
    current = next;
    if (isShortLink(current)) continue;
    // Một link hết hạn thường đổ về trang chủ TikTok, giữ link gốc còn hơn lưu trang vô nghĩa.
    return isTikTokProductUrl(current.toString()) ? normalizeTikTokProductUrl(current.toString()) : raw;
  }
  return raw;
}

async function resolveSettingsLinks(input, options = {}) {
  const pending = SETTINGS_LINK_KEYS
    .filter((key) => typeof input?.[key] === "string" && input[key].trim())
    .map(async (key) => [key, await resolveTikTokLink(input[key], options)]);
  return { ...input, ...Object.fromEntries(await Promise.all(pending)) };
}

module.exports = { SHORT_LINK_HOSTS, resolveSettingsLinks, resolveTikTokLink };
