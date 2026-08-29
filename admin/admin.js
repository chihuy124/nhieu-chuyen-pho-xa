(function () {
  const WORDPRESS_SOURCES = new Set([
    "https://nhieuchuyenduongpho.com",
    "https://honghotduong.com",
    "https://hongbienpro.com",
  ]);
  const loginScreen = document.getElementById("login-screen");
  const app = document.getElementById("admin-app");
  const dialog = document.getElementById("post-dialog");
  const state = { posts: [], page: 1, totalPages: 1, dateFilter: "", trashPage: 1, trashTotalPages: 1, settings: null, shareUrl: "", clickDate: "", clickRange: "14" };

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body) headers["content-type"] = "application/json";
    if (options.method && options.method !== "GET") headers["x-admin-request"] = "1";
    const response = await fetch(path, { credentials: "same-origin", ...options, headers });
    const payload = await response.json().catch(() => ({ success: false, error: "Phản hồi không hợp lệ" }));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Có lỗi xảy ra");
    return payload.data ?? payload;
  }

  function toast(message) {
    const element = document.getElementById("toast");
    element.textContent = message;
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.hidden = true; }, 2600);
  }

  function showSection(name) {
    document.querySelectorAll(".section-panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    document.querySelectorAll(".nav-item").forEach((button) => { button.classList.toggle("active", button.dataset.section === name); });
    const active = document.querySelector(`.nav-item[data-section="${name}"]`);
    document.getElementById("section-title").textContent = active?.textContent || "Tổng quan";
    document.querySelector(".sidebar").classList.remove("open");
    if (name === "trash") loadTrash(state.trashPage).catch((error) => toast(error.message));
    if (name === "clicks") loadPromoClicks().catch((error) => toast(error.message));
  }

  function statusBadge(post) {
    const span = document.createElement("span");
    span.className = `status-badge ${post.status}`;
    span.textContent = post.status === "published" ? "Đã đăng" : "Bản nháp";
    return span;
  }

  function recentItem(post) {
    const item = document.createElement("article");
    item.className = "recent-item";
    const image = document.createElement("img");
    image.className = "recent-thumb";
    image.src = post.coverImage || "/assets/promo-10-10.webp";
    image.alt = "";
    const body = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = post.title;
    const meta = document.createElement("p"); meta.textContent = `${new Date(post.publishedAt).toLocaleDateString("vi-VN")} · ${post.videos?.length || 0} video`;
    body.append(title, meta);
    item.append(image, body, statusBadge(post));
    return item;
  }

  function closePostMenus(except = null) {
    document.querySelectorAll(".post-actions-menu").forEach((menu) => {
      if (menu === except) return;
      menu.hidden = true;
      menu.parentElement?.querySelector(".edit-button")?.setAttribute("aria-expanded", "false");
    });
  }

  function postShareUrl(post) {
    const fallback = `/post/${encodeURIComponent(post.slug || "")}`;
    const permalink = String(post.permalink || "");
    const safePath = permalink.startsWith("/") && !permalink.startsWith("//") ? permalink : fallback;
    return new URL(safePath, location.origin).toString();
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (_error) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Không thể sao chép link");
    }
  }

  function postActions(post) {
    const actions = document.createElement("div");
    actions.className = "post-actions";
    const toggle = document.createElement("button");
    toggle.className = "edit-button";
    toggle.type = "button";
    toggle.textContent = "⋯";
    toggle.setAttribute("aria-label", `Mở thao tác cho ${post.title}`);
    toggle.setAttribute("aria-haspopup", "menu");
    toggle.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "post-actions-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.setAttribute("role", "menuitem");
    copy.textContent = "Sao chép link bài viết";
    copy.addEventListener("click", async () => {
      closePostMenus();
      try { await copyText(postShareUrl(post)); toast("Đã sao chép link bài viết"); }
      catch (error) { toast(error.message); }
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.setAttribute("role", "menuitem");
    edit.textContent = "Chỉnh sửa bài viết";
    edit.addEventListener("click", () => { closePostMenus(); openEditor(post); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "menu-danger";
    remove.setAttribute("role", "menuitem");
    remove.textContent = "Chuyển vào thùng rác";
    remove.addEventListener("click", () => {
      closePostMenus();
      movePostToTrash(post.id).catch((error) => toast(error.message));
    });
    menu.append(copy, edit, remove);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = menu.hidden;
      closePostMenus(menu);
      menu.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    actions.addEventListener("click", (event) => event.stopPropagation());
    actions.append(toggle, menu);
    return actions;
  }

  function postDateKey(post) {
    const raw = String(post.publishedAt || "");
    const sourceDate = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] || "khong-ro-ngay";
    if (!/(?:z|[+-]\d{2}:?\d{2})$/i.test(raw)) return sourceDate;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return sourceDate;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    }).formatToParts(parsed).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function formatPostDate(dateKey) {
    if (dateKey === "khong-ro-ngay") return "Không rõ ngày đăng";
    const [year, month, day] = dateKey.split("-").map(Number);
    const label = new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function groupPostsByDate(posts) {
    return posts.reduce((groups, post) => {
      const dateKey = postDateKey(post);
      const existing = groups.find((group) => group.dateKey === dateKey);
      if (!existing) return [...groups, { dateKey, posts: [post] }];
      return groups.map((group) => (
        group.dateKey === dateKey ? { ...group, posts: [...group.posts, post] } : group
      ));
    }, []);
  }

  function createPostRow(post) {
    const row = document.createElement("article");
    row.className = "post-row";
    const image = document.createElement("img"); image.src = post.coverImage || "/assets/promo-10-10.webp"; image.alt = "";
    const body = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = post.title;
    const text = document.createElement("p"); text.textContent = post.excerpt || post.slug;
    body.append(title, text);
    const [year, month, day] = postDateKey(post).split("-");
    const time = document.createElement("time"); time.textContent = day ? `${Number(day)}/${Number(month)}/${year}` : "—";
    row.append(image, body, time, statusBadge(post), postActions(post));
    return row;
  }

  function createDateGroup(group) {
    const section = document.createElement("section");
    section.className = "post-date-group content-card";
    const heading = document.createElement("header");
    heading.className = "post-date-heading";
    const title = document.createElement("h3"); title.textContent = formatPostDate(group.dateKey);
    const count = document.createElement("span"); count.textContent = `${group.posts.length} bài`;
    heading.append(title, count);
    const rows = document.createElement("div");
    rows.replaceChildren(...group.posts.map(createPostRow));
    section.append(heading, rows);
    return section;
  }

  function renderPosts(data) {
    if (!state.dateFilter) state.posts = data.posts;
    state.page = data.page;
    state.totalPages = data.totalPages;
    const table = document.getElementById("posts-table");
    if (data.posts.length) {
      table.replaceChildren(...groupPostsByDate(data.posts).map(createDateGroup));
    } else {
      const empty = document.createElement("p");
      empty.className = "trash-empty content-card";
      empty.textContent = state.dateFilter ? "Không có bài viết trong ngày đã chọn." : "Chưa có bài viết.";
      table.replaceChildren(empty);
    }
    const summary = document.getElementById("posts-filter-summary");
    summary.textContent = state.dateFilter
      ? `${data.total} bài trong ngày ${formatPostDate(state.dateFilter)}.`
      : `Đang hiển thị tất cả ${data.total} bài viết.`;
    document.getElementById("clear-posts-date").hidden = !state.dateFilter;
    const pagination = document.getElementById("admin-pagination");
    pagination.replaceChildren();
    for (let page = Math.max(1, data.page - 2); page <= Math.min(data.totalPages, data.page + 2); page += 1) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = page; button.classList.toggle("active", page === data.page); button.addEventListener("click", () => loadPosts(page)); pagination.append(button);
    }
    if (!state.dateFilter) {
      refreshMetrics(data);
      refreshPostSelect();
    }
  }

  function refreshMetrics(data) {
    document.getElementById("metric-posts").textContent = data.total;
    document.getElementById("metric-videos").textContent = state.posts.reduce((sum, post) => sum + (post.videos?.length || 0), 0);
    document.getElementById("metric-published").textContent = state.posts.filter((post) => post.status === "published").length;
    document.getElementById("recent-posts").replaceChildren(...state.posts.slice(0, 6).map(recentItem));
  }

  function refreshPostSelect() {
    const select = document.getElementById("link-post");
    const current = select.value;
    select.replaceChildren(new Option("Chọn bài viết…", ""), ...state.posts.map((post) => new Option(post.title, post.slug)));
    select.value = current;
  }

  async function loadPosts(page = 1) {
    const requestedDate = state.dateFilter;
    const searchParams = new URLSearchParams({ page: String(page), limit: "20" });
    if (requestedDate) searchParams.set("date", requestedDate);
    const data = await request(`/api/admin/posts?${searchParams}`);
    if (requestedDate !== state.dateFilter) return;
    renderPosts(data);
  }

  async function applyPostDateFilter(value) {
    state.dateFilter = value;
    await loadPosts(1);
  }

  function trashActions(post) {
    const actions = document.createElement("div");
    actions.className = "trash-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "secondary-button compact-action";
    restore.textContent = "Khôi phục";
    restore.addEventListener("click", () => restoreTrashedPost(post.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button compact-action";
    remove.textContent = "Xóa vĩnh viễn";
    remove.addEventListener("click", () => permanentlyDeletePost(post.id));
    actions.append(restore, remove);
    return actions;
  }

  function renderTrash(data) {
    state.trashPage = data.page;
    state.trashTotalPages = data.totalPages;
    const table = document.getElementById("trash-table");
    if (!data.posts.length) {
      const empty = document.createElement("p");
      empty.className = "trash-empty";
      empty.textContent = "Thùng rác đang trống.";
      table.replaceChildren(empty);
    } else {
      table.replaceChildren(...data.posts.map((post) => {
        const row = document.createElement("article");
        row.className = "post-row trash-row";
        const image = document.createElement("img"); image.src = post.coverImage || "/assets/promo-10-10.webp"; image.alt = "";
        const body = document.createElement("div");
        const title = document.createElement("h3"); title.textContent = post.title;
        const text = document.createElement("p"); text.textContent = post.excerpt || post.slug;
        body.append(title, text);
        const time = document.createElement("time"); time.textContent = `Đã xoá ${new Date(post.deletedAt).toLocaleDateString("vi-VN")}`;
        row.append(image, body, time, trashActions(post));
        return row;
      }));
    }
    const pagination = document.getElementById("trash-pagination");
    pagination.replaceChildren();
    for (let page = Math.max(1, data.page - 2); page <= Math.min(data.totalPages, data.page + 2); page += 1) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = page; button.classList.toggle("active", page === data.page); button.addEventListener("click", () => loadTrash(page)); pagination.append(button);
    }
  }

  async function loadTrash(page = 1) {
    const data = await request(`/api/admin/posts?trash=1&page=${page}&limit=20`);
    renderTrash(data);
  }

  async function movePostToTrash(id, closeDialog = false) {
    if (!id || !confirm("Chuyển bài viết này vào thùng rác?")) return false;
    await request(`/api/admin/post?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (closeDialog) dialog.close();
    await Promise.all([loadPosts(1), loadTrash(1)]);
    toast("Đã chuyển bài viết vào thùng rác");
    return true;
  }

  async function restoreTrashedPost(id) {
    try {
      await request(`/api/admin/post?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ operation: "restore" }),
      });
      await Promise.all([loadTrash(state.trashPage), loadPosts(1)]);
      toast("Đã khôi phục bài viết");
    } catch (error) { toast(error.message); }
  }

  async function permanentlyDeletePost(id) {
    if (!confirm("Xóa vĩnh viễn bài viết này?")) return;
    if (!confirm("Thao tác này không thể hoàn tác. Bạn chắc chắn muốn tiếp tục?")) return;
    try {
      await request(`/api/admin/post?id=${encodeURIComponent(id)}&permanent=1`, { method: "DELETE" });
      await loadTrash(state.trashPage);
      toast("Đã xóa vĩnh viễn bài viết");
    } catch (error) { toast(error.message); }
  }

  function createClickRow(day) {
    const row = document.createElement("div");
    row.className = "click-row";
    const date = document.createElement("span");
    date.className = "click-date";
    date.textContent = formatPostDate(day.date);
    const banner1 = document.createElement("strong"); banner1.textContent = day.banner1;
    const banner2 = document.createElement("strong"); banner2.textContent = day.banner2;
    const total = document.createElement("strong"); total.className = "click-total"; total.textContent = day.total;
    row.append(date, banner1, banner2, total);
    return row;
  }

  function renderPromoClicks(data) {
    document.getElementById("metric-clicks-banner1").textContent = data.totals.banner1;
    document.getElementById("metric-clicks-banner2").textContent = data.totals.banner2;
    document.getElementById("metric-clicks-total").textContent = data.totals.total;
    const table = document.getElementById("clicks-table");
    if (!data.days.length) {
      const empty = document.createElement("p");
      empty.className = "trash-empty";
      empty.textContent = "Chưa có dữ liệu click.";
      table.replaceChildren(empty);
      return;
    }
    table.replaceChildren(...data.days.map(createClickRow));
  }

  async function loadPromoClicks() {
    const searchParams = new URLSearchParams(
      state.clickDate ? { date: state.clickDate } : { days: state.clickRange },
    );
    const requestedDate = state.clickDate;
    const requestedRange = state.clickRange;
    const data = await request(`/api/admin/promo-clicks?${searchParams}`);
    if (requestedDate !== state.clickDate || requestedRange !== state.clickRange) return;
    document.getElementById("clear-clicks-date").hidden = !state.clickDate;
    document.getElementById("clicks-range").disabled = Boolean(state.clickDate);
    renderPromoClicks(data);
  }

  function localDateTime(value) {
    const date = value ? new Date(value) : new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function openEditor(post = null) {
    document.getElementById("post-dialog-title").textContent = post ? "Chỉnh sửa bài viết" : "Tạo bài viết";
    document.getElementById("post-id").value = post?.id || "";
    document.getElementById("post-title").value = post?.title || "";
    document.getElementById("post-slug").value = post?.slug || "";
    document.getElementById("post-excerpt").value = post?.excerpt || "";
    document.getElementById("post-content").value = post?.contentHtml || "";
    document.getElementById("post-cover").value = post?.coverImage || "";
    document.getElementById("post-date").value = localDateTime(post?.publishedAt);
    document.getElementById("post-videos").value = (post?.videos || []).join("\n");
    document.getElementById("post-tiktok").value = post?.tiktokUrl || "";
    document.getElementById("post-status").value = post?.status || "draft";
    document.getElementById("delete-post").hidden = !post;
    document.getElementById("post-error").textContent = "";
    dialog.showModal();
  }

  async function savePost(event) {
    event.preventDefault();
    const id = document.getElementById("post-id").value;
    const payload = {
      title: document.getElementById("post-title").value,
      slug: document.getElementById("post-slug").value,
      excerpt: document.getElementById("post-excerpt").value,
      contentHtml: document.getElementById("post-content").value,
      coverImage: document.getElementById("post-cover").value,
      publishedAt: new Date(document.getElementById("post-date").value).toISOString(),
      videos: document.getElementById("post-videos").value.split("\n").map((value) => value.trim()).filter(Boolean),
      tiktokUrl: document.getElementById("post-tiktok").value,
      status: document.getElementById("post-status").value,
    };
    try {
      await request(id ? `/api/admin/post?id=${encodeURIComponent(id)}` : "/api/admin/posts", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      dialog.close(); await loadPosts(state.page); toast("Đã lưu bài viết");
    } catch (error) { document.getElementById("post-error").textContent = error.message; }
  }

  async function deleteCurrentPost() {
    const id = document.getElementById("post-id").value;
    try { await movePostToTrash(id, true); } catch (error) { document.getElementById("post-error").textContent = error.message; }
  }

  function setCrawlMode() {
    const crawlMode = document.querySelector('input[name="crawl-mode"]:checked').value;
    const singleFields = document.getElementById("crawl-single-fields");
    const rangeFields = document.getElementById("crawl-range-fields");
    const singleDate = document.getElementById("crawl-date");
    const fromDateInput = document.getElementById("crawl-from");
    const toDateInput = document.getElementById("crawl-to");
    singleFields.hidden = crawlMode !== "single";
    rangeFields.hidden = crawlMode !== "range";
    singleDate.required = crawlMode === "single";
    fromDateInput.required = crawlMode === "range";
    toDateInput.required = crawlMode === "range";
    document.getElementById("crawl-message").textContent = crawlMode === "single"
      ? "Chọn ngày để bắt đầu."
      : "Chọn khoảng ngày để bắt đầu.";
  }

  function selectedCrawlDates() {
    const crawlMode = document.querySelector('input[name="crawl-mode"]:checked').value;
    const selectedDate = document.getElementById("crawl-date").value;
    const fromDate = crawlMode === "single" ? selectedDate : document.getElementById("crawl-from").value;
    const toDate = crawlMode === "single" ? selectedDate : document.getElementById("crawl-to").value;
    return { fromDate, toDate };
  }

  function parseWordPressSourceText(sourceText) {
    const cleanSourceText = sourceText
      .replace(/^\uFEFF/, "")
      .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, "")
      .replace(/(?:\s*<!--[\s\S]*?-->\s*)+$/, "");
    try {
      const items = JSON.parse(cleanSourceText);
      if (!Array.isArray(items)) throw new Error("Dữ liệu WordPress không đúng định dạng");
      return items;
    } catch (error) {
      if (error.message === "Dữ liệu WordPress không đúng định dạng") throw error;
      throw new Error("Trình duyệt không nhận được JSON từ nguồn WordPress");
    }
  }

  async function fetchWordPressSource(sourceUrl) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let sourceResponse;
      let sourceText;
      try {
        sourceResponse = await fetch(sourceUrl, {
          headers: { accept: "application/json" },
          credentials: "omit",
          redirect: "error",
        });
        sourceText = await sourceResponse.text();
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      let items;
      let parseError;
      if (sourceResponse.ok) {
        try { items = parseWordPressSourceText(sourceText); } catch (error) { parseError = error; }
      }
      const transient = sourceResponse.status === 429 || sourceResponse.status >= 500 || Boolean(parseError);
      if (transient && attempt < 3) {
        const retryAfterHeader = sourceResponse.headers.get("retry-after");
        const retryAfter = retryAfterHeader === null || retryAfterHeader.trim() === "" ? NaN : Number(retryAfterHeader);
        const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0
          ? Math.min(8_000, retryAfter * 1_000)
          : attempt * 500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!sourceResponse.ok) throw new Error(`Nguồn WordPress trả về mã ${sourceResponse.status}`);
      if (parseError) throw parseError;
      return { sourceResponse, items };
    }
    throw new Error("Không thể kết nối nguồn WordPress");
  }

  async function runCrawl(event) {
    event.preventDefault();
    const button = document.getElementById("crawl-button");
    const { fromDate, toDate } = selectedCrawlDates();
    const sourceOrigin = document.getElementById("crawl-source").value;
    if (!WORDPRESS_SOURCES.has(sourceOrigin)) {
      document.getElementById("crawl-message").textContent = "Nguồn crawl không hợp lệ";
      return;
    }
    let page = 1; let processed = 0; let errors = 0;
    button.disabled = true; button.textContent = "Đang crawl…";
    document.getElementById("crawl-status-dot").className = "status-dot running";
    try {
      while (true) {
        let data;
        try {
          const sourceUrl = new URL("/wp-json/wp/v2/posts", sourceOrigin);
          sourceUrl.searchParams.set("after", `${fromDate}T00:00:00`);
          sourceUrl.searchParams.set("before", `${toDate}T23:59:59`);
          sourceUrl.searchParams.set("page", String(page));
          sourceUrl.searchParams.set("per_page", "20");
          sourceUrl.searchParams.set("orderby", "date");
          sourceUrl.searchParams.set("order", "asc");
          sourceUrl.searchParams.set("_embed", "1");
          const { sourceResponse, items } = await fetchWordPressSource(sourceUrl);
          const sourceTotalPages = Math.max(1, Number(sourceResponse.headers.get("x-wp-totalpages")) || page);
          const sourceTotal = Number(sourceResponse.headers.get("x-wp-total")) || items.length;
          data = await request("/api/admin/crawl", {
            method: "POST",
            body: JSON.stringify({ sourceOrigin, fromDate, toDate, page, items, totalPages: sourceTotalPages, total: sourceTotal }),
          });
        } catch (browserError) {
          try {
            data = await request("/api/admin/crawl", { method: "POST", body: JSON.stringify({ sourceOrigin, fromDate, toDate, page }) });
          } catch (serverError) {
            throw new Error(`${browserError.message}. Đường dự phòng: ${serverError.message}`);
          }
        }
        processed += data.processed; errors += data.errors.length;
        const percent = Math.min(100, Math.round((data.page / data.totalPages) * 100));
        document.getElementById("crawl-progress-number").textContent = `${percent}%`;
        const progress = document.getElementById("crawl-progress"); progress.value = percent; progress.textContent = `${percent}%`;
        document.getElementById("crawl-processed").textContent = processed;
        document.getElementById("crawl-errors").textContent = errors;
        document.getElementById("crawl-message").textContent = `Đang xử lý batch ${data.page}/${data.totalPages} · ${data.total} bài từ nguồn.`;
        if (data.completed) break;
        page = data.nextPage;
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      document.getElementById("crawl-status-dot").className = "status-dot done";
      document.getElementById("crawl-message").textContent = `Hoàn tất: ${processed} bài, ${errors} lỗi.`;
      await loadPosts(1); toast("Crawl nội dung hoàn tất");
    } catch (error) {
      document.getElementById("crawl-status-dot").className = "status-dot";
      document.getElementById("crawl-message").textContent = error.message;
    } finally { button.disabled = false; button.textContent = "Bắt đầu crawl"; }
  }

  async function loadSettings() {
    state.settings = await request("/api/admin/settings");
    document.getElementById("setting-title").value = state.settings.siteTitle;
    document.getElementById("setting-description").value = state.settings.siteDescription;
    document.getElementById("setting-fanpage").value = state.settings.fanpageUrl || "";
    document.getElementById("setting-banner").value = state.settings.promoImageUrl;
    document.getElementById("setting-tiktok").value = state.settings.defaultTikTokUrl;
    document.getElementById("setting-promo-enabled").checked = state.settings.promoEnabled;
    document.getElementById("setting-shopee-banner").value = state.settings.shopeeImageUrl || "";
    document.getElementById("setting-shopee-url").value = state.settings.shopeeUrl || "";
    document.getElementById("setting-shopee-enabled").checked = Boolean(state.settings.shopeeEnabled);
    document.getElementById("setting-promo-order").value = state.settings.promoOrder || "tiktok-first";
  }

  async function saveSettings(event) {
    event.preventDefault();
    const payload = { siteTitle:document.getElementById("setting-title").value, siteDescription:document.getElementById("setting-description").value, fanpageUrl:document.getElementById("setting-fanpage").value, promoImageUrl:document.getElementById("setting-banner").value, defaultTikTokUrl:document.getElementById("setting-tiktok").value, promoEnabled:document.getElementById("setting-promo-enabled").checked, shopeeImageUrl:document.getElementById("setting-shopee-banner").value, shopeeUrl:document.getElementById("setting-shopee-url").value, shopeeEnabled:document.getElementById("setting-shopee-enabled").checked, promoOrder:document.getElementById("setting-promo-order").value };
    try { state.settings = await request("/api/admin/settings", { method:"PUT", body:JSON.stringify(payload) }); toast("Đã lưu cấu hình"); } catch (error) { toast(error.message); }
  }

  async function createLink(event) {
    event.preventDefault();
    try {
      const result = await request("/api/shim/create", { method:"POST", body:JSON.stringify({ postSlug:document.getElementById("link-post").value, url:document.getElementById("link-tiktok").value }) });
      state.shareUrl = `${location.origin}/l-j.co/profile/id-${result.id}`;
      document.getElementById("link-result").textContent = state.shareUrl;
      document.getElementById("copy-link").disabled = false;
      toast("Đã tạo link chia sẻ");
    } catch (error) { toast(error.message); }
  }

  async function boot() {
    const session = await request("/api/admin/session").catch(() => ({ authenticated:false }));
    if (!session.authenticated) return;
    loginScreen.hidden = true; app.hidden = false;
    await Promise.all([loadPosts(), loadSettings()]);
  }

  document.getElementById("login-form").addEventListener("submit", async (event) => { event.preventDefault(); const error = document.getElementById("login-error"); error.textContent=""; try { await request("/api/admin/login", { method:"POST", body:JSON.stringify({ password:document.getElementById("login-password").value }) }); loginScreen.hidden=true; app.hidden=false; await Promise.all([loadPosts(),loadSettings()]); } catch (cause) { error.textContent=cause.message; } });
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.section)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.go)));
  document.getElementById("sidebar-toggle").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  document.getElementById("new-post-top").addEventListener("click", () => openEditor());
  document.getElementById("new-post-button").addEventListener("click", () => openEditor());
  document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
  document.getElementById("cancel-post").addEventListener("click", () => dialog.close());
  document.getElementById("post-form").addEventListener("submit", savePost);
  document.getElementById("delete-post").addEventListener("click", deleteCurrentPost);
  document.getElementById("posts-date-filter").addEventListener("change", (event) => {
    applyPostDateFilter(event.target.value).catch((error) => toast(error.message));
  });
  document.getElementById("clear-posts-date").addEventListener("click", () => {
    document.getElementById("posts-date-filter").value = "";
    applyPostDateFilter("").catch((error) => toast(error.message));
  });
  document.getElementById("clicks-range").addEventListener("change", (event) => {
    state.clickRange = event.target.value;
    loadPromoClicks().catch((error) => toast(error.message));
  });
  document.getElementById("clicks-date").addEventListener("change", (event) => {
    state.clickDate = event.target.value;
    loadPromoClicks().catch((error) => toast(error.message));
  });
  document.getElementById("clear-clicks-date").addEventListener("click", () => {
    document.getElementById("clicks-date").value = "";
    state.clickDate = "";
    loadPromoClicks().catch((error) => toast(error.message));
  });
  document.getElementById("crawl-form").addEventListener("submit", runCrawl);
  document.querySelectorAll('input[name="crawl-mode"]').forEach((input) => input.addEventListener("change", setCrawlMode));
  document.getElementById("settings-form").addEventListener("submit", saveSettings);
  document.getElementById("link-form").addEventListener("submit", createLink);
  document.getElementById("copy-link").addEventListener("click", async () => { if (!state.shareUrl) return; await navigator.clipboard.writeText(state.shareUrl); toast("Đã sao chép link"); });
  document.getElementById("logout-button").addEventListener("click", async () => { await request("/api/admin/logout", { method:"POST" }); location.reload(); });
  document.addEventListener("click", () => closePostMenus());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePostMenus(); });
  setCrawlMode();
  boot();
})();
