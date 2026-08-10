(function () {
  const target = new URLSearchParams(window.location.search).get("u");
  function isAllowedTikTokUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const domains = ["tiktok.com", "tiktokv.com", "tiktokcdn.com"];
      return url.protocol === "https:"
        && !url.username
        && !url.password
        && domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch (_error) {
      return false;
    }
  }
  if (isAllowedTikTokUrl(target)) window.location.replace(new URL(target).toString());
  else document.body.textContent = "Link TikTok khong hop le.";
})();
