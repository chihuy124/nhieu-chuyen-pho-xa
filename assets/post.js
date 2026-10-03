(async function () {
  const params = new URLSearchParams(location.search);
  if (location.pathname === "/post.html") {
    const legacySlug = params.get("slug");
    if (!legacySlug) {
      location.replace("/");
      return;
    }
    const target = new URL(`/post/${encodeURIComponent(legacySlug)}`, location.origin);
    const campaignId = params.get("promo");
    if (campaignId === "default" || /^[a-f0-9]{12,32}$/i.test(campaignId || "")) {
      target.searchParams.set("promo", campaignId);
    }
    location.replace(`${target.pathname}${target.search}`);
    return;
  }
  let promoRedirecting = false;
  const memorySeenKeys = new Set();

  function createPromoPageViewId() {
    const navigationEntry = performance.getEntriesByType?.("navigation")?.[0];
    const historyState = history.state && typeof history.state === "object" ? history.state : {};
    const existingPageViewId = String(historyState.ncdpPromoPageViewId || "");
    if (navigationEntry?.type === "back_forward" && existingPageViewId) return existingPageViewId;
    const pageViewId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    history.replaceState({ ...historyState, ncdpPromoPageViewId: pageViewId }, document.title);
    return pageViewId;
  }

  const pageViewId = createPromoPageViewId();

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (_error) { return memorySeenKeys.has(key) ? "1" : null; }
  }

  function safeSessionSet(key) {
    memorySeenKeys.add(key);
    try { sessionStorage.setItem(key, "1"); } catch (_error) { /* Memory fallback already recorded. */ }
  }

  function reportPromoClick(banner) {
    if (!banner) return;
    const payload = JSON.stringify({ banner });
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon?.("/api/content/promo-click", blob)) return;
      void fetch("/api/content/promo-click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => { /* Thống kê click không được chặn việc chuyển hướng. */ });
    } catch (_error) { /* Thống kê click không được chặn việc chuyển hướng. */ }
  }

  let lastTouchRadius = 0;
  document.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    lastTouchRadius = Math.max(Number(touch.radiusX) || 0, Number(touch.radiusY) || 0);
  }, { passive: true, capture: true });

  let cachedRenderer = null;
  function readGpuRenderer() {
    if (cachedRenderer !== null) return cachedRenderer;
    cachedRenderer = "";
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      if (!gl) return cachedRenderer;
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      cachedRenderer = String(renderer || "").slice(0, 200);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch (_error) { /* Trình duyệt chặn đọc GPU thì để server tự quyết định. */ }
    return cachedRenderer;
  }

  function collectDeviceSignals() {
    return { renderer: readGpuRenderer(), touchRadius: lastTouchRadius };
  }

  // Bắt tay sẵn với sàn ngay khi biết banner sắp hiện. Lúc người dùng chạm thì chỉ còn
  // việc gửi request, không phải chờ tra DNS và bắt tay TLS — vài trăm mili giây trên
  // mạng di động, đúng khoảng chờ khiến người ta thoát trước khi sản phẩm kịp hiện.
  const warmedOrigins = new Set();
  function warmUpOrigin(value) {
    let origin;
    try { origin = new URL(String(value || "")).origin; } catch (_error) { return; }
    if (warmedOrigins.has(origin)) return;
    warmedOrigins.add(origin);
    for (const rel of ["dns-prefetch", "preconnect"]) {
      const link = document.createElement("link");
      link.rel = rel;
      link.href = origin;
      document.head.append(link);
    }
  }

  async function refreshFollowUpToken(campaignId) {
    try {
      const promo = await NCDP.api(`/api/content/promo?campaign=${encodeURIComponent(campaignId)}`);
      return promo.followUp?.enabled ? promo.followUp.token || "" : "";
    } catch (_error) {
      return "";
    }
  }

  const FOLLOW_UP_ORIGINS = { shopee: "https://shopee.vn", tiktok: "https://www.tiktok.com" };

  async function setupPromo() {
    const campaignId = params.get("promo") || "default";
    const overlay = document.getElementById("promo-overlay");
    const image = document.getElementById("promo-image");
    const closeButton = document.getElementById("promo-close");
    const seen = (key) => safeSessionGet(key) === "1";
    let followUpTimer = null;

    const hideOffer = () => {
      overlay.hidden = true;
      document.body.classList.remove("promo-open");
      overlay.onclick = null;
      overlay.onkeydown = null;
      image.removeAttribute("src");
    };

    const showOffer = async ({ banner, imageUrl, targetUrl, resolveTarget, seenKey }) => {
      if (seen(seenKey)) return false;
      promoRedirecting = false;
      overlay.hidden = true;
      image.src = imageUrl;
      // Giải link song song với việc tải ảnh nên banner không hiện chậm hơn trước.
      const [resolvedTarget] = await Promise.all([
        resolveTarget ? resolveTarget() : targetUrl,
        image.decode().catch(() => { /* The browser can still render a loaded fallback image. */ }),
      ]);
      // Không có link thì đừng hiện banner, người dùng chạm vào sẽ chẳng đi đâu cả.
      if (!resolvedTarget || seen(seenKey)) return false;
      overlay.hidden = false;
      document.body.classList.add("promo-open");

      const openTarget = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (promoRedirecting) return;
        promoRedirecting = true;
        safeSessionSet(seenKey);
        reportPromoClick(banner);
        hideOffer();
        location.assign(resolvedTarget);
      };

      overlay.onclick = openTarget;
      overlay.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") openTarget(event);
      };
      closeButton.focus({ preventScroll: true });
      return true;
    };

    try {
      const promo = await NCDP.api(`/api/content/promo?campaign=${encodeURIComponent(campaignId)}`);
      if (!promo.enabled) return;
      warmUpOrigin(promo.tiktokUrl);
      if (promo.followUp?.enabled) warmUpOrigin(FOLLOW_UP_ORIGINS[promo.followUp.platform]);
      const sequenceId = `${campaignId}:${promo.promoOrder || "tiktok-first"}`;
      const tiktokSeenKey = `ncdp:promo-seen:sequence:v3:${pageViewId}:${sequenceId}:tiktok`;
      const shopeeSeenKey = `ncdp:promo-seen:sequence:v3:${pageViewId}:${sequenceId}:shopee`;

      const tiktokOffer = {
        banner: "banner1",
        imageUrl: promo.imageUrl,
        targetUrl: promo.tiktokUrl,
        seenKey: tiktokSeenKey,
      };
      let followUpToken = promo.followUp?.token || "";
      let followUpTarget = "";

      const exchangeFollowUpToken = async () => NCDP.api("/api/content/promo-target", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: followUpToken, signals: collectDeviceSignals() }),
      });

      const resolveFollowUpTarget = async () => {
        // Lần render sau (quay về từ app) dùng lại link cũ, khỏi xin thêm lượt cấp.
        if (followUpTarget) return followUpTarget;
        for (let attempt = 0; attempt < 2 && followUpToken; attempt += 1) {
          try {
            followUpTarget = (await exchangeFollowUpToken()).targetUrl || "";
            return followUpTarget;
          } catch (_error) {
            // Lượt cấp hết hạn khi người dùng nán lại trong app, xin lượt mới rồi thử lại.
            followUpToken = attempt === 0 ? await refreshFollowUpToken(campaignId) : "";
          }
        }
        return "";
      };

      const shopeeOffer = promo.followUp?.enabled ? {
        banner: "banner2",
        imageUrl: promo.followUp.imageUrl,
        resolveTarget: resolveFollowUpTarget,
        seenKey: shopeeSeenKey,
      } : null;
      const orderedOffers = promo.promoOrder === "shopee-first" && shopeeOffer
        ? [shopeeOffer, tiktokOffer]
        : [tiktokOffer, ...(shopeeOffer ? [shopeeOffer] : [])];
      const nextOffer = () => orderedOffers.find((offer) => !seen(offer.seenKey));

      const scheduleNextOffer = () => {
        const offer = nextOffer();
        if (!offer || followUpTimer) return;
        const delayMs = Number.isFinite(promo.followUp?.delayMs) ? promo.followUp.delayMs : 1000;
        followUpTimer = setTimeout(() => {
          followUpTimer = null;
          void showOffer(offer);
        }, Math.max(0, delayMs));
      };

      if (orderedOffers.some((offer) => seen(offer.seenKey))) {
        scheduleNextOffer();
      } else {
        // Banner đầu không giải được link thì nhường lượt cho banner sau, đừng bỏ trống cả chuỗi.
        for (const offer of orderedOffers) {
          if (await showOffer(offer)) break;
        }
      }

      const resumeSequence = () => {
        promoRedirecting = false;
        if (orderedOffers.some((offer) => seen(offer.seenKey))) {
          hideOffer();
          scheduleNextOffer();
        }
      };
      window.addEventListener("pageshow", resumeSequence);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") resumeSequence();
      });
    } catch (_error) {
      hideOffer();
    }
  }

  await setupPromo();
})();
