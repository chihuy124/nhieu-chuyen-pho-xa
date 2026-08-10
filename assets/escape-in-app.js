(function () {
  const api = window.InAppBrowserEscaper;
  if (!api || !api.InAppBrowserDetector.isInAppBrowser()) return;

  const configuredTarget = document.querySelector('meta[name="external-browser-url"]')?.content;
  const targetUrl = configuredTarget || window.location.href;
  const openButton = document.querySelector("[data-open-external]");
  if (openButton) {
    openButton.addEventListener("click", function () {
      api.InAppBrowserEscaper.escape({ fallbackUrl: targetUrl, force: true });
    });
  }

  api.InAppBrowserEscaper.escape({ fallbackUrl: targetUrl });
})();
