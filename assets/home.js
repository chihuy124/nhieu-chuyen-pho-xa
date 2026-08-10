(async function () {
  const list = document.getElementById("post-list");
  const empty = document.getElementById("empty-state");
  const count = document.getElementById("post-count");
  const pagination = document.getElementById("pagination");
  const page = Math.max(1, Number(new URLSearchParams(location.search).get("page")) || 1);

  function cardFor(post) {
    const article = document.createElement("article");
    article.className = "post-card";
    const mediaLink = document.createElement("a");
    mediaLink.className = "post-card-image";
    mediaLink.href = post.permalink;
    if (post.coverImage) {
      const image = document.createElement("img");
      image.src = post.coverImage;
      image.alt = post.coverAlt || "";
      image.loading = "lazy";
      mediaLink.append(image);
    }
    const body = document.createElement("div");
    const time = document.createElement("time");
    time.dateTime = post.publishedAt;
    time.textContent = NCDP.formatDate(post.publishedAt);
    const link = document.createElement("a");
    link.href = post.permalink;
    const title = document.createElement("h3");
    title.textContent = post.title;
    link.append(title);
    const excerpt = document.createElement("p");
    excerpt.textContent = post.excerpt || (post.videos?.length ? "Bài viết có video" : "Đọc nội dung bài viết");
    body.append(time, link, excerpt);
    article.append(mediaLink, body);
    return article;
  }

  function renderPagination(data) {
    pagination.replaceChildren();
    if (data.totalPages <= 1) return;
    const first = Math.max(1, data.page - 2);
    const last = Math.min(data.totalPages, data.page + 2);
    for (let current = first; current <= last; current += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(current);
      if (current === data.page) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => { location.href = current === 1 ? "/" : `/?page=${current}`; });
      pagination.append(button);
    }
  }

  try {
    const [settings, data] = await Promise.all([
      NCDP.api("/api/content/settings"),
      NCDP.api(`/api/content/posts?page=${page}&limit=12`),
    ]);
    NCDP.applySettings(settings);
    document.title = settings.siteTitle;
    list.replaceChildren(...data.posts.map(cardFor));
    count.textContent = `${data.total} bài viết`;
    empty.hidden = data.posts.length > 0;
    renderPagination(data);
  } catch (error) {
    list.replaceChildren();
    empty.hidden = false;
    empty.querySelector("h2").textContent = "Chưa thể tải nội dung";
    empty.querySelector("p").textContent = error.message;
  }
})();
