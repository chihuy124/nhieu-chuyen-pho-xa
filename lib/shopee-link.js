const { isAllowedShopeeUrl, parseWebUrl } = require("./security");

const SHORT_LINK_HOSTS = ["s.shopee.vn", "shope.ee"];
const TIMEOUT_MS = 3500;

// Hỏi bằng User-Agent máy tính thì Shopee trả thẳng 301 kèm đủ tham số hoa hồng.
// Hỏi bằng User-Agent di động thì nhận về một trang HTML trung gian tự chạy JS để
// bung app, và chính trang đó đẩy app vào đường dẫn nó không hiểu.
const RESOLVER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

// App Shopee không nhận ra đường dẫn /opaanlp/ mà link rút gọn trỏ tới: nó bung ra
// rồi báo không tìm thấy trang. Dạng /product/ thì app mở đúng sản phẩm.
const APP_UNFRIENDLY_PATH = /^\/opaanlp\/(\d+)\/(\d+)\/?$/;

// Chỉ nhận đích đúng là một trang sản phẩm. Shopee đổi định dạng hay trả về thứ gì
// khác thì giữ link gốc: tệ nhất là quay về hành vi cũ, không bao giờ tệ hơn.
const PRODUCT_PATHS = [APP_UNFRIENDLY_PATH, /^\/product\/(\d+)\/(\d+)\/?$/, /-i\.(\d+)\.(\d+)\/?$/];

function isProductDestination(url) {
  return url.hostname.toLowerCase().endsWith("shopee.vn")
    && PRODUCT_PATHS.some((pattern) => pattern.test(url.pathname));
}

function isShortLink(url) {
  return SHORT_LINK_HOSTS.includes(String(url.hostname || "").toLowerCase());
}

// Không khớp thì trả lại đúng chuỗi ban đầu, tránh việc đi qua URL.toString()
// làm thay đổi link mà người quản trị đã nhập.
function toAppFriendlyUrl(url, original) {
  const match = APP_UNFRIENDLY_PATH.exec(url.pathname);
  if (!match) return original;
  url.pathname = `/product/${match[1]}/${match[2]}`;
  return url.toString();
}

// Link rút gọn mang theo credential_token đổi mới mỗi lượt gọi, nên phải giải ngay
// lúc người dùng sắp bấm chứ không lưu sẵn được. Hỏng ở bất kỳ bước nào thì trả lại
// link gốc, tức là quay về đúng hành vi cũ chứ không mất banner.
async function resolveShopeeAppLink(value, options = {}) {
  const { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = options;
  const raw = String(value || "").trim();
  const start = parseWebUrl(raw);
  if (!start || !isAllowedShopeeUrl(raw)) return raw;
  if (!isShortLink(start)) return toAppFriendlyUrl(start, raw);

  let location;
  try {
    const response = await fetchImpl(start.toString(), {
      redirect: "manual",
      headers: { "user-agent": RESOLVER_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    location = response?.headers?.get?.("location");
  } catch (_error) {
    return raw;
  }
  if (!location) return raw;

  let resolved;
  try { resolved = new URL(location, start); } catch (_error) { return raw; }
  if (!isAllowedShopeeUrl(resolved.toString()) || !isProductDestination(resolved)) return raw;
  return toAppFriendlyUrl(resolved, resolved.toString());
}

module.exports = { SHORT_LINK_HOSTS, resolveShopeeAppLink };
