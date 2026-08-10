const IN_APP_BROWSER_PATTERN = /FBAN|FBAV|FB_IAB|FB4A|FBIOS|Instagram|Zalo|TikTok/i;
const SOCIAL_BOT_PATTERN = /facebookexternalhit|Facebot|WhatsApp|Viber|TelegramBot/i;

function isInAppBrowserUserAgent(value) {
  return IN_APP_BROWSER_PATTERN.test(String(value || ""));
}

function isSocialBotUserAgent(value) {
  return SOCIAL_BOT_PATTERN.test(String(value || ""));
}

module.exports = { isInAppBrowserUserAgent, isSocialBotUserAgent };
