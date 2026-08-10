(function () {
  window.NCDP = {
    async api(path, options = {}) {
      const response = await fetch(path, { credentials: "same-origin", ...options });
      const payload = await response.json().catch(() => ({ success: false, error: "Phản hồi không hợp lệ" }));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Có lỗi xảy ra");
      return payload.data;
    },
    applySettings(settings) {
      document.querySelectorAll("[data-site-title]").forEach((element) => { element.textContent = settings.siteTitle; });
      document.querySelectorAll("[data-site-description]").forEach((element) => { element.textContent = settings.siteDescription; });
      document.querySelectorAll("[data-site-logo]").forEach((image) => {
        image.src = settings.logoUrl;
        image.alt = `Logo ${settings.siteTitle}`;
      });
    },
    formatDate(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(date);
    },
  };
})();
