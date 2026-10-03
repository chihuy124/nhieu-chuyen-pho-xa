// DevTools giả được User-Agent, kích thước màn hình và sự kiện chạm, nhưng không đổi được
// GPU thật của máy. Tên GPU vì thế là tín hiệu đáng tin nhất để tách máy tính khỏi điện thoại.
const MOBILE_GPU_PATTERN = /adreno|mali-|immortalis|xclipse|powervr|videocore|tegra|apple a\d{1,2}\b/i;
const DESKTOP_GPU_PATTERN = /nvidia|geforce|\brtx\b|\bgtx\b|quadro|radeon|firepro|\bamd\b|intel|llvmpipe|swiftshader|softwarerasterizer|apple m\d{1,2}\b/i;

// Chạm thật của ngón tay có bán kính khoảng 10-30px; chạm do DevTools dựng ra là 0.5.
// Ngưỡng để sát mức giả lập, tránh chặn nhầm bút cảm ứng hay máy báo bán kính nhỏ.
const MIN_REAL_TOUCH_RADIUS = 1;

function readRenderer(signals) {
  return String(signals?.renderer || "").slice(0, 200);
}

function inspectDeviceSignals(signals) {
  const renderer = readRenderer(signals);
  if (MOBILE_GPU_PATTERN.test(renderer)) return { trusted: true, reason: "mobile-gpu" };
  if (DESKTOP_GPU_PATTERN.test(renderer)) return { trusted: false, reason: "desktop-gpu" };
  const touchRadius = Number(signals?.touchRadius);
  if (Number.isFinite(touchRadius) && touchRadius > 0 && touchRadius < MIN_REAL_TOUCH_RADIUS) {
    return { trusted: false, reason: "synthetic-touch" };
  }
  // Trình duyệt chặn đọc GPU thì thà cho qua còn hơn chặn nhầm khách mua hàng thật.
  return { trusted: true, reason: "unknown" };
}

module.exports = { MIN_REAL_TOUCH_RADIUS, inspectDeviceSignals };
