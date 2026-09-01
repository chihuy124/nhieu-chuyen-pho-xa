const IN_APP_BROWSER_PATTERN = /FBAN|FBAV|FB_IAB|FB4A|FBIOS|Instagram|Zalo|TikTok/i;
const SOCIAL_BOT_PATTERN = /facebookexternalhit|Facebot|WhatsApp|Viber|TelegramBot/i;
const MOBILE_PATTERN = /Android|iPhone|iPod|iPad|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i;
const DESKTOP_OVERRIDE_PATTERN = /Windows NT|Macintosh|X11|CrOS/i;

function isMobileUserAgent(value) {
  const userAgent = String(value || "");
  if (!userAgent || !MOBILE_PATTERN.test(userAgent)) return false;
  // Máy tính giả lập di động vẫn lộ nền tảng thật, iPadOS thì báo Macintosh kèm cảm ứng.
  return !DESKTOP_OVERRIDE_PATTERN.test(userAgent);
}

function isInAppBrowserUserAgent(value) {
  return IN_APP_BROWSER_PATTERN.test(String(value || ""));
}

function isSocialBotUserAgent(value) {
  return SOCIAL_BOT_PATTERN.test(String(value || ""));
}

module.exports = { isInAppBrowserUserAgent, isMobileUserAgent, isSocialBotUserAgent };
